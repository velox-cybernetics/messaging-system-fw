from fastapi import Request
import hmac, hashlib, time


#CONSTANTS
#a real webhook is a few kilobytes, a batch of meta events included, so a bigger body is refused before it can fill the instance's memory
MAX_BODY_BYTES: int = 1024 * 1024

#blooio's own replay window, a signed delivery older than this is someone resending a captured one
BLOOIO_MAX_AGE_SECONDS: int = 300


#the raw body read only up to MAX_BODY_BYTES, None when it is bigger, the signatures are checked against these exact bytes
async def read_body(request: Request) -> bytes | None:
    chunks: list[bytes] = []
    size: int = 0

    #streamed so a giant body is dropped at the cap instead of read in full first
    async for chunk in request.stream():
        size += len(chunk)

        if(size > MAX_BODY_BYTES):
            return None

        chunks.append(chunk)

    return b"".join(chunks)


#meta signs every event with the app secret, sent as "sha256=<hex>" in X-Hub-Signature-256
def meta_signed(body: bytes, signature: str, app_secret: str) -> bool:
    expected: str = "sha256=" + hmac.new(app_secret.encode(), body, hashlib.sha256).hexdigest()

    #compare_digest so the response time does not leak how close a guess was
    return hmac.compare_digest(signature.encode(), expected.encode())


#blooio signs "<t>.<body>" with the webhook secret, sent as "t=<unix seconds>,v1=<hex>" in X-Blooio-Signature
def blooio_signed(body: bytes, signature: str, secret: str) -> bool:
    fields: dict[str, str] = {}

    for field in signature.split(","):
        name, _, value = field.strip().partition("=")

        fields[name] = value

    timestamp: str = fields.get("t", "")

    #a delivery outside the window is a replay, even with a real signature on it
    if(not timestamp.isdigit() or abs(time.time() - int(timestamp)) > BLOOIO_MAX_AGE_SECONDS):
        return False

    expected: str = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()

    #compare_digest so the response time does not leak how close a guess was
    return hmac.compare_digest(fields.get("v1", "").encode(), expected.encode())
