from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv 
from helpers import batcher
from helpers import webhook_guard as guard
import uvicorn, os, json

#no docs pages, app.py serves this router and they would come along with it
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

#load env 
load_dotenv()

#the signing secret blooio showed once when the /blooio/webhook subscription was made
#getenv so the other webhooks still start before it is in .env, every delivery is refused until it is
BLOOIO_WEBHOOK_SECRET: str | None = os.getenv("BLOOIO_WEBHOOK_SECRET")

#process POST data
@app.post("/blooio/webhook")
async def blooio_hook(request: Request):
    if(not BLOOIO_WEBHOOK_SECRET):
        print("BLOOIO WEBHOOK ERROR: BLOOIO_WEBHOOK_SECRET is not set, delivery refused")

        return JSONResponse({"error": "blooio webhook is not configured"}, status_code=503)

    #use await because the data from request does not come all at once, thus wait for it all to come and while still listing for more post
    body: bytes | None = await guard.read_body(request)

    if(body is None):
        print("BLOOIO WEBHOOK REJECTED: body is over the size cap")

        return JSONResponse({"error": "body too large"}, status_code=413)

    #blooio signs every delivery, so a forged message never reaches the batcher
    if(not guard.blooio_signed(body, request.headers.get("X-Blooio-Signature", ""), BLOOIO_WEBHOOK_SECRET)):
        print("BLOOIO WEBHOOK REJECTED: signature is wrong or expired")

        return JSONResponse({"error": "unauthorized"}, status_code=401)

    data: dict = json.loads(body)

    if(data.get("type") == "message.received"):
        #extract data from the POST
        id: str = data.get("data").get("sender")
        text: str = data.get("data").get("text") 
        attachments: list = data.get("data").get("attachments")

        #blooio does not document the body, so both id names are tried for the dedupe
        message_id: str | None = data.get("data").get("message_id") or data.get("data").get("id")

        #a message is text + attachments
        await batcher.add_message("blooio", id, message_id, [text, attachments])

    return {"status" : "ok"}




if(__name__ == "__main__"):
    uvicorn.run(app, port=8000)

    
