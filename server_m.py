from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, JSONResponse
from dotenv import load_dotenv 
from helpers import batcher
from helpers import webhook_guard as guard
import uvicorn, os, json, hmac

#no docs pages, app.py serves this router and they would come along with it
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

#load env
load_dotenv()

#the verify token typed into the meta app dashboard when the webhook is subscribed
MESSENGER_VERIFY_TOKEN: str = os.environ["MESSENGER_VERIFY_TOKEN"]

#the app secret (app settings > basic in the meta app dashboard), meta signs every page event with it
#getenv so the other webhooks still start before it is in .env, every event is refused until it is
MESSENGER_APP_SECRET: str | None = os.getenv("MESSENGER_APP_SECRET")


#pulls [text, attachments, referral] out of one messaging event, None when there is nothing to answer
def event_message(event: dict) -> list | None:
    message: dict = event.get("message") or {}
    postback: dict = event.get("postback") or {}

    #echoes are the page's own sends, from this system or the owner replying in the inbox
    if(message.get("is_echo")):
        return None

    #a postback is a get started, icebreaker, or menu tap, its title is what the customer tapped
    text: str | None = message.get("text") or postback.get("title") or None

    #stickers like the thumbs up have nothing to describe or answer
    attachments: list = [attachment for attachment in message.get("attachments") or [] if attachment.get("type") != "sticker"]

    #an ad click comes inside the message, on its own for an existing thread, or with a get started tap
    referral: dict = message.get("referral") or event.get("referral") or postback.get("referral") or {}

    #only ad referrals carry context, m.me links and shop products do not
    if(referral.get("source") != "ADS"):
        referral = {}

    if(not text and not attachments and not referral):
        return None

    return [text, attachments, referral]


#the id meta resends the event with, an ad click on its own has no mid so the sender and time stand in for it
def event_message_id(event: dict, id: str) -> str:
    message: dict = event.get("message") or {}
    postback: dict = event.get("postback") or {}

    return message.get("mid") or postback.get("mid") or f"{id}_{event.get('timestamp')}"


#process GET data to verify webhook
@app.get("/messenger/webhook")
async def messenger_verify(request: Request) -> PlainTextResponse:
    mode: str = request.query_params.get("hub.mode", "")
    token: str = request.query_params.get("hub.verify_token", "")
    challenge: str = request.query_params.get("hub.challenge", "")

    #meta only gets its challenge back when the token matches the one set in the app dashboard, compare_digest so the response time does not leak how close a guess was
    if(mode == "subscribe" and hmac.compare_digest(token.encode(), MESSENGER_VERIFY_TOKEN.encode())):
        return PlainTextResponse(challenge)

    print("MESSENGER WEBHOOK VERIFY FAILED: mode or verify token did not match")

    return PlainTextResponse("Forbidden", status_code=403)

#process POST data
@app.post("/messenger/webhook")
async def messenger_hook(request: Request) -> JSONResponse:
    if(not MESSENGER_APP_SECRET):
        print("MESSENGER WEBHOOK ERROR: MESSENGER_APP_SECRET is not set, event refused")

        return JSONResponse({"error": "messenger webhook is not configured"}, status_code=503)

    body: bytes | None = await guard.read_body(request)

    if(body is None):
        print("MESSENGER WEBHOOK REJECTED: body is over the size cap")

        return JSONResponse({"error": "body too large"}, status_code=413)

    #meta signs every event, so a forged message never reaches the batcher
    if(not guard.meta_signed(body, request.headers.get("X-Hub-Signature-256", ""), MESSENGER_APP_SECRET)):
        print("MESSENGER WEBHOOK REJECTED: wrong signature")

        return JSONResponse({"error": "unauthorized"}, status_code=401)

    data: dict = json.loads(body)

    #messenger events always come as a page object
    if(data.get("object") != "page"):
        return JSONResponse({"status": "ok"})

    #meta can group several entries and events into one POST
    for entry in data.get("entry") or []:
        for event in entry.get("messaging") or []:
            id: str = (event.get("sender") or {}).get("id")
            message: list | None = event_message(event)

            #reads, deliveries, reactions, echoes, and sticker only messages have nothing to answer
            if(not id or message is None):
                continue

            #a message is text + attachments + referral
            await batcher.add_message("messenger", id, event_message_id(event, id), message)

    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    uvicorn.run(app, port=8000)
