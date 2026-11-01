from fastapi import FastAPI
from contextlib import asynccontextmanager
import asyncio
import server_b, server_i, server_m, server_q
from helpers import batcher
from helpers.followup import followup_loop
from helpers.dashboard_sync import outbox_loop, flag_loop
from helpers.restriction import sync_restricted

#starts the daily follow up loop and the dashboard pollers with the server, and stops them on shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    followup_task: asyncio.Task = asyncio.create_task(followup_loop())
    outbox_task: asyncio.Task = asyncio.create_task(outbox_loop())
    flag_task: asyncio.Task = asyncio.create_task(flag_loop())

    #a failed sync or replay must never stop the server from booting
    try:
        await asyncio.to_thread(sync_restricted)

    except Exception as error:
        print("RESTRICTED SYNC ERROR: " + str(error))

    #messages that came in before a restart and never got answered
    try:
        await batcher.replay()

    except Exception as error:
        print("REPLAY ERROR: " + str(error))

    yield

    followup_task.cancel()
    outbox_task.cancel()
    flag_task.cancel()

#one app serving all four webhooks, so a single render instance covers blooio, ig, messenger, and the website quote form
#no /docs, /redoc, or /openapi.json, so nobody can pull up a map of the webhooks
app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

for server in (server_b, server_i, server_m, server_q):
    app.include_router(server.app.router)

#render pings this to know the instance is up
@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}
