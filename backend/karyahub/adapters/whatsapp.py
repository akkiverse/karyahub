"""WhatsApp Business Cloud API (outbound). Interface: async send(to, kind, body) -> {id, status}."""

import hashlib

from karyahub.errors import AppError, not_configured


class MockWhatsApp:
    name = "mock"

    async def send(self, to: str, kind: str, body: str) -> dict[str, str]:
        if not to or not body:
            raise AppError("invalid", "A message needs a recipient and some text.", 422)
        digest = hashlib.sha256(f"{to}|{kind}|{body}".encode()).hexdigest()[:12]
        # Nothing is sent: the demo only records that a message would have gone out.
        return {"id": f"wamid.demo.{digest}", "status": "simulated", "kind": kind}


class LiveWhatsApp:
    name = "live"

    def __init__(self, token: str) -> None:
        self.token = token

    async def send(self, to: str, kind: str, body: str) -> dict[str, str]:
        if not self.token:
            raise not_configured("WhatsApp")
        raise AppError("not_built", "The live WhatsApp adapter isn't built yet. Use mock mode.", 501)
