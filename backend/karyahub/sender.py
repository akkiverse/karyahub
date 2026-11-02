"""The one sender layer (CR-0012, AC-31.2): every bill, estimate and later reminder goes out through here.

In v0.8.0 no business has its own WhatsApp number connected, so sending answers with a wa.me link that
opens WhatsApp on the person's phone with the message ready. When K6 connects a number, it registers a
sender for that business in ``CONNECTED`` and the same call sends the message itself; screens don't change.
"""

from collections.abc import Callable
from typing import Any, Protocol


class Sender(Protocol):
    async def send_document(
        self, business: Any, phone: str, text: str, wa_link: Callable[[str, str], str]
    ) -> dict[str, str]: ...


class LinkSender:
    """No number connected: hand back the link; the person presses Send in WhatsApp."""

    async def send_document(
        self, business: Any, phone: str, text: str, wa_link: Callable[[str, str], str]
    ) -> dict[str, str]:
        return {"how": "link", "url": wa_link(phone, text)}


LINK = LinkSender()
CONNECTED: dict[str, Sender] = {}  # business id -> its connected WhatsApp number's sender (K6)


def sender_for(business: Any) -> Sender:
    return CONNECTED.get(getattr(business, "id", ""), LINK)
