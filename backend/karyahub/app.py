"""KaryaHub API (FastAPI). All routes live under /api; the web app calls /api/v1/*."""

import json
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, Header, Query, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from karyahub import __version__
from karyahub.adapters import Adapters, get_adapters
from karyahub.domain import amc, otp, renewals, workflow
from karyahub.domain.documents import DocLine, Totals, compute_totals
from karyahub.domain.extraction import Extraction
from karyahub.errors import AppError, install_error_handlers
from karyahub.settings import Settings, get_settings
from karyahub.tenancy import Tenant, get_tenant
from karyahub.whatsapp import webhook

SettingsDep = Annotated[Settings, Depends(get_settings)]


def tenant_dep(x_tenant_id: Annotated[str | None, Header()] = None) -> Tenant:
    return get_tenant(x_tenant_id)


TenantDep = Annotated[Tenant, Depends(tenant_dep)]


def adapters_dep(settings: SettingsDep) -> Adapters:
    return get_adapters(settings)


AdaptersDep = Annotated[Adapters, Depends(adapters_dep)]

SERVICES = [
    {
        "id": "whatsapp",
        "name": "WhatsApp",
        "key": "KARYAHUB_WHATSAPP_ACCESS_TOKEN",
        "setting": "whatsapp_access_token",
    },
    {"id": "speech", "name": "Speech-to-text", "key": "KARYAHUB_SPEECH_API_KEY", "setting": "speech_api_key"},
    {"id": "llm", "name": "LLM", "key": "KARYAHUB_LLM_API_KEY", "setting": "llm_api_key"},
]


# ---------- request and response models ----------
class MediaRequest(BaseModel):
    media_id: str = Field(min_length=1, max_length=200)
    simulate_failure: bool = False


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    simulate_failure: bool = False


class TextResult(BaseModel):
    text: str
    language: str = ""
    adapter: str


class ExtractResult(Extraction):
    adapter: str


class SendRequest(BaseModel):
    to: str = Field(min_length=1, max_length=20)
    kind: Literal["text", "document", "template"] = "text"
    body: str = Field(min_length=1, max_length=4096)


class TotalsRequest(BaseModel):
    lines: list[DocLine]
    inter_state: bool = False


class RenewalsRequest(BaseModel):
    customers: list[renewals.Customer]
    today: date
    days: int = Field(30, ge=0, le=366)


class ReminderRequest(BaseModel):
    customer: renewals.Customer
    today: date


class PlanRequest(BaseModel):
    contract: amc.Contract
    today: date
    existing_keys: list[str] = []


def create_app() -> FastAPI:
    app = FastAPI(
        title="KaryaHub API",
        version=__version__,
        description="WhatsApp job reports to job records, GST paperwork, proof of work and AMC visit plans.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    install_error_handlers(app)
    api = APIRouter(prefix="/api")
    v1 = APIRouter(prefix="/api/v1")

    @api.get("/health")
    async def health(settings: SettingsDep) -> dict[str, str]:
        return {"status": "ok", "service": "karyahub-api", "version": __version__, "mode": settings.mode}

    @v1.get("/meta")
    async def meta(settings: SettingsDep, tenant: TenantDep) -> dict[str, Any]:
        services = []
        for s in SERVICES:
            configured = bool(getattr(settings, s["setting"]))
            status = "Mock" if settings.mode == "mock" else ("Live" if configured else "Missing key")
            services.append(
                {
                    "id": s["id"],
                    "name": s["name"],
                    "key": s["key"],
                    "configured": configured,
                    "status": status,
                }
            )
        return {
            "version": __version__,
            "mode": settings.mode,
            "tenant": tenant.model_dump(),
            "services": services,
            "workflow": {
                "states": [{"id": s, "label": workflow.STATE_LABELS[s]} for s in workflow.STATES],
                "actions": [
                    {"action": a.name, "label": a.label, "from": list(a.from_states), "to": a.to_state}
                    for a in workflow.ACTIONS.values()
                ],
            },
        }

    # ---------- processing pipeline: Transcribe -> Extract ----------
    @v1.post("/pipeline/transcribe")
    async def transcribe(req: MediaRequest, a: AdaptersDep) -> TextResult:
        r = await a.speech.transcribe(req.media_id, fail=req.simulate_failure)
        return TextResult(text=r["text"], language=r.get("language", ""), adapter=a.mode)

    @v1.post("/pipeline/read-image")
    async def read_image(req: MediaRequest, a: AdaptersDep) -> TextResult:
        r = await a.llm.read_image(req.media_id, fail=req.simulate_failure)
        return TextResult(text=r["text"], adapter=a.mode)

    @v1.post("/pipeline/extract")
    async def extract(req: TextRequest, a: AdaptersDep) -> ExtractResult:
        r = await a.llm.extract_job(req.text, fail=req.simulate_failure)
        return ExtractResult(**r.model_dump(), adapter=a.mode)

    @v1.post("/messages/send")
    async def send(req: SendRequest, a: AdaptersDep) -> dict[str, str]:
        return await a.whatsapp.send(req.to, req.kind, req.body)

    # ---------- paperwork and renewals ----------
    @v1.post("/documents/totals")
    async def totals(req: TotalsRequest) -> Totals:
        return compute_totals(req.lines, inter_state=req.inter_state)

    @v1.post("/renewals/due")
    async def due(req: RenewalsRequest) -> dict[str, Any]:
        today = req.today.isoformat()
        listed = renewals.due_within(req.customers, today, req.days)
        gone = renewals.lapsed(req.customers, today)
        return {"due": listed, "lapsed": gone, "money_at_stake": renewals.money_at_stake(listed)}

    @v1.post("/renewals/reminder-text")
    async def reminder(req: ReminderRequest, tenant: TenantDep) -> dict[str, str]:
        if not req.customer.amc_expiry:
            raise AppError("no_expiry", "This customer has no AMC end date yet.", 422)
        return {"text": renewals.reminder_text(req.customer, tenant.business_name, req.today.isoformat())}

    # ---------- job workflow and proof of work ----------
    @v1.post("/jobs/{job_id}/transitions")
    async def transition(
        job_id: str, req: workflow.TransitionRequest, settings: SettingsDep, tenant: TenantDep, a: AdaptersDep
    ) -> workflow.TransitionResult:
        secret = settings.secret("otp_secret")
        ctx: dict[str, Any] = {}
        if req.action == "verify_otp":
            ctx["otp_check"] = lambda: otp.verify(
                str(req.payload.get("challenge", "")),
                str(req.payload.get("code", "")),
                job_id,
                tenant.id,
                secret,
            )
        result = workflow.transition(job_id, tenant.id, req, ctx)
        if req.action == "request_otp" and not result.duplicate:
            challenge, code, expires = otp.issue(job_id, tenant.id, secret, settings.otp_ttl_seconds)
            to = str(req.payload.get("phone", ""))
            body = (
                f"Your {tenant.business_name} service code is {code}. "
                "Share it with the technician only when the work is done."
            )
            sent = await a.whatsapp.send(to or "demo", "template", body)
            result.otp = {"challenge": challenge, "expires_at": expires, "sent": sent["status"]}
            if settings.mode == "mock":
                result.otp["demo_code"] = code  # mock mode only: nothing is really sent
        return result

    # ---------- AMC visit planning ----------
    @v1.post("/amc/plan")
    async def amc_plan(req: PlanRequest) -> amc.Plan:
        return amc.plan(req.contract, req.today, req.existing_keys)

    # ---------- WhatsApp Cloud API webhook ----------
    @v1.get("/whatsapp/webhook", response_class=PlainTextResponse)
    async def wa_verify(
        settings: SettingsDep,
        hub_mode: Annotated[str | None, Query(alias="hub.mode")] = None,
        hub_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
        hub_challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
    ) -> str:
        if not webhook.verify_handshake(hub_mode, hub_token, settings.secret("whatsapp_verify_token")):
            raise AppError("forbidden", "Verify token doesn't match.", 403)
        return hub_challenge or ""

    @v1.post("/whatsapp/webhook")
    async def wa_receive(
        request: Request,
        settings: SettingsDep,
        a: AdaptersDep,
        x_hub_signature_256: Annotated[str | None, Header()] = None,
    ) -> dict[str, Any]:
        secret = settings.secret("whatsapp_app_secret")
        if not secret:
            raise AppError("not_configured", "Not configured: add WhatsApp app secret", 503)
        raw = await request.body()
        if not webhook.valid_signature(raw, x_hub_signature_256, secret):
            raise AppError("bad_signature", "Signature check failed.", 401)
        try:
            payload = json.loads(raw or b"{}")
        except json.JSONDecodeError as exc:
            raise AppError("bad_payload", "The webhook body isn't valid JSON.", 400) from exc
        messages, dupes = webhook.parse(payload, secret)
        results = []
        for m in messages:
            item: dict[str, Any] = {"id": m.id, "type": m.type, "from_hash": m.from_hash}
            try:
                if m.type == "text":
                    text = m.text
                elif m.type == "audio":
                    text = (await a.speech.transcribe(m.media_id))["text"]
                elif m.type == "image":
                    text = (await a.llm.read_image(m.media_id))["text"]
                else:
                    raise AppError("unsupported", f"Messages of type {m.type} aren't handled yet.", 422)
                item.update(
                    status="processed",
                    transcript=text,
                    extraction=(await a.llm.extract_job(text)).model_dump(),
                )
            except AppError as e:
                item.update(status="failed", error={"code": e.code, "message": e.message})
            results.append(item)
        return {"received": len(messages), "duplicates": dupes, "results": results}

    app.include_router(api)
    app.include_router(v1)
    return app


app = create_app()
