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
IG_VERIFY_TOKEN: str = os.environ["IG_VERIFY_TOKEN"]

#the instagram app secret (instagram > api setup with instagram login in the meta app dashboard), meta signs every ig event with it
#getenv so the other webhooks still start before it is in .env, every event is refused until it is
IG_APP_SECRET: str | None = os.getenv("IG_APP_SECRET")


#process GET data to verify webhook
@app.get("/ig/webhook")
async def ig_verify(request: Request) -> PlainTextResponse:
    mode: str = request.query_params.get("hub.mode", "")
    token: str = request.query_params.get("hub.verify_token", "")
    challenge: str = request.query_params.get("hub.challenge", "")

    #meta only gets its challenge back when the token matches the one set in the app dashboard, compare_digest so the response time does not leak how close a guess was
    if(mode == "subscribe" and hmac.compare_digest(token.encode(), IG_VERIFY_TOKEN.encode())):
        return PlainTextResponse(challenge)

    print("IG WEBHOOK VERIFY FAILED: mode or verify token did not match")

    return PlainTextResponse("Forbidden", status_code=403)

#process POST data
@app.post("/ig/webhook")
async def ig_hook(request: Request) -> JSONResponse:
    if(not IG_APP_SECRET):
        print("IG WEBHOOK ERROR: IG_APP_SECRET is not set, event refused")

        return JSONResponse({"error": "ig webhook is not configured"}, status_code=503)

    body: bytes | None = await guard.read_body(request)

    if(body is None):
        print("IG WEBHOOK REJECTED: body is over the size cap")

        return JSONResponse({"error": "body too large"}, status_code=413)

    #meta signs every event, so a forged message never reaches the batcher
    if(not guard.meta_signed(body, request.headers.get("X-Hub-Signature-256", ""), IG_APP_SECRET)):
        print("IG WEBHOOK REJECTED: wrong signature")

        return JSONResponse({"error": "unauthorized"}, status_code=401)

    data: dict = json.loads(body)

    #meta can group several entries and events into one POST, so every one of them is read
    for entry in data.get("entry") or []:
        for event in entry.get("messaging") or []:
            message: dict = event.get("message") or {}

            #check if its an incoming message from a user, echoes are the account's own sends
            if(not message or message.get("is_echo")):
                continue

            id: str = (event.get("sender") or {}).get("id")

            if(not id):
                continue

            #a message is text + attachments + referral
            await batcher.add_message("ig", id, message.get("mid"), [message.get("text"), message.get("attachments"), message.get("referral")])

    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    uvicorn.run(app, port=8000)
