"""One error shape for every failure: {"error": {"code", "message"}} with plain-English messages."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


READ_FAILED = "Couldn't read this message. Try again."


def not_configured(service: str) -> AppError:
    return AppError("not_configured", f"Not configured: add {service} key", 503)


def _body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(exc.code, exc.message), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", []) if p != "body")
        msg = f"Check {where}: {first.get('msg', 'invalid value')}" if where else "Check the request."
        return JSONResponse(_body("validation_error", msg), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        message = (
            "That address doesn't exist in the KaryaHub API." if exc.status_code == 404 else str(exc.detail)
        )
        return JSONResponse(_body(code, message), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Without this line a server fault is invisible in the Vercel logs (the answer is just a plain 500).
        logging.getLogger("karyahub").error(
            "Unhandled %s on %s %s", type(exc).__name__, request.method, request.url.path, exc_info=exc
        )
        return JSONResponse(_body("internal_error", "Something went wrong on our side. Try again."), 500)
