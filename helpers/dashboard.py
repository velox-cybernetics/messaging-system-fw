from dotenv import load_dotenv
from helpers import username as un
from helpers.media_prep import open_image, decode_lock
from PIL import Image
from urllib.parse import urlencode
import os, re, io, base64, threading, time, requests

# HOUSTON ANNIVERSARY SALE START
from src.prompts import anniversary_sale
# HOUSTON ANNIVERSARY SALE END

load_dotenv()


# CONFIG
#both have to be set or every dashboard call below does nothing, and restriction checks use local state only
DASHBOARD_URL: str = os.getenv("DASHBOARD_URL", "").rstrip("/")
DASH_KEY: str = os.getenv("DASH_KEY", "")

ENABLED: bool = bool(DASHBOARD_URL and DASH_KEY)


# CONSTANTS
REQUEST_TIMEOUT: int = 6

#a network flap or dashboard deploy is retried, a 4xx never is since a bad key or schema does not heal
POST_ATTEMPTS: int = 3
POST_BACKOFF_SECONDS: list[int] = [2, 5]

#one giant message can not bloat the dashboard, the server clips again
TRANSCRIPT_MAX_CHARS: int = 2000

#how long one fetched copy of the dashboard's restricted set stays fresh
RESTRICTED_CACHE_SECONDS: int = 15

#the dashboard names the channels after the platforms
DASH_CHANNELS: dict[str, str] = {"ig": "instagram", "messenger": "facebook", "blooio": "blooio"}


# STATE
session: requests.Session = requests.Session()

#username lookups hit meta, so each answer is kept for the life of the process
username_cache: dict[str, str] = {}

#ids is None when the last fetch failed, the lock only guards the cache and is never held across the http call
restricted_cache: dict = {"time": 0.0, "ids": None}
restricted_lock: threading.Lock = threading.Lock()


# PRICES
#both house styles, 450$ and $450, the comma grouped form is tried first so 4,500 is not read as 4
AMOUNT: str = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?"

PRICE_RE: re.Pattern = re.compile(rf"\$\s?({AMOUNT})|({AMOUNT})\s?\$")


#blocking post to the ingest endpoint, only ever called off the reply path, true when the dashboard took it
def post_event(payload: dict) -> bool:
    for attempt in range(POST_ATTEMPTS):
        try:
            response: requests.Response = session.post(f"{DASHBOARD_URL}/api/ingest", json=payload, headers={"x-dash-key": DASH_KEY}, timeout=REQUEST_TIMEOUT)

            if(response.status_code < 300):
                return True

            #a rejected event has to show in the logs, never silent
            print(f"DASH EVENT {payload.get('event')} REJECTED {response.status_code}: {response.text[:120]}")

            if(response.status_code < 500):
                return False

        except Exception as error:
            print("DASH EVENT ERROR: " + str(error))

        if(attempt < POST_ATTEMPTS - 1):
            time.sleep(POST_BACKOFF_SECONDS[min(attempt, len(POST_BACKOFF_SECONDS) - 1)])

    return False


#runs the report on a daemon thread, so the dashboard can never block or break a reply
def fire(work, *args) -> None:
    if(not ENABLED):
        return

    threading.Thread(target=work, args=args, daemon=True).start()


#blocking get on the dashboard api, raises on any failure
def get(path: str) -> dict:
    response: requests.Response = session.get(f"{DASHBOARD_URL}{path}", headers={"x-dash-key": DASH_KEY}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()

    return response.json()


#blocking post on the dashboard api outside of ingest, raises on any failure
def post(path: str, body: dict) -> dict:
    response: requests.Response = session.post(f"{DASHBOARD_URL}{path}", json=body, headers={"x-dash-key": DASH_KEY}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()

    return response.json()


#every message of one customer's thread as the dashboard keeps it, oldest first, each {"role": customer|agent|owner, "text", "ts", "media"}
#[] when the dashboard is off, down, or has no thread, so a missing thread never stops a reply
def fetch_thread(id: str, channel: str) -> list[dict]:
    if(not ENABLED):
        return []

    try:
        messages: list = get(f"/api/messages?{urlencode({'channel': DASH_CHANNELS[channel], 'userId': id})}").get("messages", [])

    except Exception as error:
        print("DASH THREAD FETCH FAILED: " + str(error))

        return []

    thread: list[dict] = [message for message in messages if(isinstance(message, dict))]

    thread.sort(key=lambda message: int(message.get("ts") or 0))

    return thread



#display name for the conversation list, "" when unknown so it never blanks a stored name
def resolve_username(id: str, channel: str) -> str:
    if(id in username_cache):
        return username_cache[id]

    name: str = ""

    try:
        found: str = un.username(id, channel)

        #the lookups fall back to the id itself, which means no name was found
        if(found != id):
            name = found

    except Exception:
        name = ""

    username_cache[id] = name

    return name


#longest side of a picture sent to the dashboard, big enough to see the car, small enough to load fast
PREVIEW_MAX_SIDE: int = 1280

#the dashboard keeps at most this many pictures on one message
MAX_MEDIA: int = 10


#turns a data url into a small jpeg for the dashboard
def preview_jpeg(data_url: str) -> bytes:
    image_bytes: bytes = base64.b64decode(data_url.split(",", 1)[1])

    #the same guard as the media prep, one decode at a time and only the formats and sizes a phone sends
    with decode_lock:
        image: Image.Image = open_image(image_bytes).convert("RGB")
        image.thumbnail((PREVIEW_MAX_SIDE, PREVIEW_MAX_SIDE))

        buffer: io.BytesIO = io.BytesIO()
        image.save(buffer, format="JPEG", quality=80)

    return buffer.getvalue()


#uploads one picture and returns its url, "" on any error so the message still shows its text and description
def upload_media(id: str, channel: str, data_url: str) -> str:
    try:
        response: requests.Response = session.post(f"{DASHBOARD_URL}/api/media", params={"channel": DASH_CHANNELS[channel]}, data=preview_jpeg(data_url), headers={"x-dash-key": DASH_KEY, "Content-Type": "image/jpeg"}, timeout=20)
        response.raise_for_status()

        return response.json()["url"]

    #never retried, a picture is not worth holding up the thread
    except Exception as error:
        print("DASH MEDIA UPLOAD ERROR: " + str(error))

        return ""


#blocking, uploads the pictures first then posts the customer's batch, only ever called inside a fire() thread
#customer_media is [{"type", "data_url", "description"}], the data urls never leave this function
def post_customer_message(id: str, channel: str, text: str, customer_media: list[dict]) -> None:
    media: list[dict] = []

    for customer_media_element in customer_media[:MAX_MEDIA]:
        url: str = ""

        #videos are too big for the upload, so only their description shows
        if(customer_media_element["type"] == "image"):
            url = upload_media(id, channel, customer_media_element["data_url"])

        media.append({"type": customer_media_element["type"], "url": url, "description": customer_media_element["description"][:500]})

    transcript: dict = {"event": "transcript", "channel": DASH_CHANNELS[channel], "userId": id, "role": "customer", "text": text[:TRANSCRIPT_MAX_CHARS]}

    if(media != []):
        transcript["media"] = media

    post_event(transcript)


#every dollar amount in a reply in order, deduped
def extract_dollar_amounts(text: str) -> list:
    amounts: list = []

    # HOUSTON ANNIVERSARY SALE START
    #the "(normally 3500$)" next to a sale price was never quoted, so it is not an amount
    text = anniversary_sale.without_normal_prices(text)
    # HOUSTON ANNIVERSARY SALE END

    for before, after in PRICE_RE.findall(text or ""):
        value: float | int = float((before or after).replace(",", ""))

        if(value.is_integer()):
            value = int(value)

        if(value not in amounts):
            amounts.append(value)

    return amounts


#the priced reply as {"text", "amounts", "at"}, text is one line so it fits the booking site
def quote_from_reply(text: str) -> dict:
    flat: str = " ".join((text or "").split())

    if(len(flat) > 240):
        flat = flat[:237] + "..."

    return {"text": flat, "amounts": extract_dollar_amounts(text), "at": time.time()}


# EVENTS
#one raw incoming customer message, counted per webhook message and not per batch
def log_incoming(id: str, channel: str) -> None:
    def work() -> None:
        post_event({"event": "in", "channel": DASH_CHANNELS[channel], "userId": id, "username": resolve_username(id, channel)})

    fire(work)


#the customer's batch, mirrored into the thread with no counters
def log_customer_message(id: str, channel: str, text: str, customer_media: list[dict] = []) -> None:
    def work() -> None:
        post_customer_message(id, channel, text, customer_media)

    if(text != "" or customer_media != []):
        fire(work)


#one reply the provider accepted, the customer batch goes first in the same thread so the thread stays in order
def log_outgoing(id: str, channel: str, text: str, customer_text: str = "", customer_media: list[dict] = []) -> None:
    #imported here since rage_functions loads every prompt and this module is imported by the model calls
    from src.rage_functions import BOOKING_LINK

    link_sent: bool = BOOKING_LINK in text

    def work() -> None:
        if(customer_text != "" or customer_media != []):
            post_customer_message(id, channel, customer_text, customer_media)

        post_event({"event": "out", "channel": DASH_CHANNELS[channel], "userId": id, "username": resolve_username(id, channel), "link": link_sent, "text": text[:TRANSCRIPT_MAX_CHARS]})

    fire(work)


#last priced reply, the booking site reads it at booking time, the dashboard skips one older than what it has
def log_quote(id: str, channel: str, quoted: dict) -> None:
    def work() -> None:
        post_event({"event": "quote", "channel": DASH_CHANNELS[channel], "userId": id, "text": quoted["text"][:TRANSCRIPT_MAX_CHARS], "amounts": quoted["amounts"], "ts": int(float(quoted["at"]) * 1000)})

    fire(work)


#tokens of one model call, the dashboard rejects an event with both at zero so it is never sent
def log_tokens(tokens_in: int, tokens_out: int) -> None:
    tokens_in = max(0, tokens_in)
    tokens_out = max(0, tokens_out)

    if(tokens_in == 0 and tokens_out == 0):
        return

    def work() -> None:
        post_event({"event": "tokens", "tokensIn": tokens_in, "tokensOut": tokens_out})

    fire(work)


# RESTRICTED
#ids the dashboard says the bot must not message, cached for 15 seconds, None when the dashboard is down
#fresh skips the cache, for the check right before a send so a switch flipped moments ago still stops it
def restricted_ids(fresh: bool = False) -> set | None:
    with restricted_lock:
        now: float = time.time()

        if(not fresh and now - restricted_cache["time"] < RESTRICTED_CACHE_SECONDS):
            return restricted_cache["ids"]

    ids: set | None = None

    try:
        #upstash can hand an all number id back as a number
        ids = set(str(id) for id in get("/api/restricted").get("restricted", []))

    except Exception as error:
        print("DASH RESTRICTED FETCH FAILED, USING LOCAL: " + str(error))

    with restricted_lock:
        restricted_cache["time"] = now
        restricted_cache["ids"] = ids

    return ids
