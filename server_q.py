from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from helpers import batcher
from helpers import webhook_guard as guard
from helpers.log import write_bs
from helpers.restriction import unrestrict
import uvicorn, os, re, hmac, json, asyncio

#no docs pages, app.py serves this router and they would come along with it
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

#load env
load_dotenv()

#shared with the website's server, which forwards every quote that passed its spam checks
#getenv so the other webhooks still start before it is in .env, every quote is refused until it is
QUOTE_SECRET: str | None = os.getenv("QUOTE_SECRET")

#the website's service slugs, named the way a customer would write them
SERVICE_NAMES: dict[str, str] = {
    "vinyl-wrap": "Vinyl Wrap",
    "paint-protection-film": "Paint Protection Film (PPF)",
    "starlight-header": "Starlight Headliner",
    "colored-ppf": "Colored PPF",
    "caliper-wraps": "Caliper Wraps",
    "window-tint": "Window Tint",
    "ceramic-coating": "Ceramic Coating",
    "paint-correction": "Paint Correction",
    "windshield-protection-film": "Windshield Protection Film",
    "chrome-delete": "Chrome Delete",
}

#the website sends the phone in E.164, the same form blooio uses for the sender of a text
E164_RE: re.Pattern = re.compile(r"\+\d{11,15}")

#control characters, zero width spaces, and direction overrides, they can hide or flip text in what the shop texts out
INVISIBLE_RE: re.Pattern = re.compile(r"[\x00-\x08\x0e-\x1f\x7f-\x9f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]")

#a link, a domain, or a phone number, none of them belongs in a name, service, or vehicle, and the name and services go out word for word in the greeting
LINK_OR_PHONE_RE: re.Pattern = re.compile(r"https?://|www\.|[a-z0-9-]\.[a-z]{2,}\b|\d(?:[\s().-]*\d){6,}", re.IGNORECASE)

#the free text fields of the form, and the longest any of them can be once cleaned
QUOTE_TEXT_FIELDS: list[str] = ["name", "service", "vehicleYear", "vehicleMake", "vehicleModel"]
MAX_FIELD_CHARS: int = 60

#the website has fewer add ons than this, so a longer list is someone stuffing the greeting
MAX_UPSELLS: int = 10


#a service slug like "window-tint" or an add on like "WINDOW TINT" to its name
def service_name(value: str) -> str:
    return SERVICE_NAMES.get(value.strip().lower().replace(" ", "-"), value.strip())


#one form field as one clean line, "" when it carries a link or a phone number so the shop's own text never does
def clean_field(value) -> str:
    #line breaks become spaces so nothing can start a new paragraph in the greeting, spaces the customer typed stay as they are
    text: str = " ".join(INVISIBLE_RE.sub("", str(value or "")).splitlines()).strip()

    if(LINK_OR_PHONE_RE.search(text)):
        return ""

    return text[:MAX_FIELD_CHARS]


#the quote with every free text field cleaned, the form is public so anything typed in it is untrusted
def clean_quote(data: dict) -> dict:
    cleaned: dict = dict(data)

    for key in QUOTE_TEXT_FIELDS:
        cleaned[key] = clean_field(data.get(key))

    cleaned["upsells"] = [clean_field(upsell) for upsell in list(data.get("upsells") or [])[:MAX_UPSELLS]]

    return cleaned


#each service named once in the order given, the form lets an add on repeat the main service, like window tint twice
def unique_service_names(values: list) -> list[str]:
    names: list[str] = []

    for value in values:
        name: str = service_name(str(value or ""))

        if(name and name.lower() not in [named.lower() for named in names]):
            names.append(name)

    return names


#the quote written as the customer's first text, so it is answered like any other first message
def quote_text(data: dict) -> str:
    name: str = str(data.get("name") or "").strip()
    service: str = service_name(str(data.get("service") or ""))

    vehicle_parts: list[str] = []

    for key in ("vehicleYear", "vehicleMake", "vehicleModel"):
        part: str = str(data.get(key) or "").strip()

        if(part):
            vehicle_parts.append(part)

    add_ons: list[str] = [add_on for add_on in unique_service_names(list(data.get("upsells") or [])) if add_on.lower() != service.lower()]

    text: str = "Hi! I just submitted a quote request on your website."

    if(service):
        text += f" I'm interested in {service}."

    if(vehicle_parts):
        text += f" My vehicle is a {' '.join(vehicle_parts)}."

    if(add_ons):
        text += f" I'd also like to add {', '.join(add_ons)}."

    if(name):
        text += f" This is {name}."

    return text


#the opener of the first reply to the quote, core puts it in place of the greeting the models open with
def quote_greeting(data: dict) -> str:
    name: str = str(data.get("name") or "").strip()

    services: list[str] = unique_service_names([data.get("service")] + list(data.get("upsells") or []))

    greeting: str = f"Hello, {name} this is preston at filthy wraps" if(name) else "Hello, this is preston at filthy wraps"

    if(len(services) > 1):
        greeting += f", I seen you just submitted a quote for {', '.join(services[:-1])} and {services[-1]}."

    elif(services):
        greeting += f", I seen you just submitted a quote for {services[0]}."

    else:
        greeting += ", I seen you just submitted a quote."

    return greeting


#process POST data from the website's quote form
@app.post("/quote/webhook")
async def quote_hook(request: Request) -> JSONResponse:
    if(not QUOTE_SECRET):
        print("QUOTE WEBHOOK ERROR: QUOTE_SECRET is not set, quote refused")

        return JSONResponse({"error": "quote webhook is not configured"}, status_code=503)

    #compare_digest so the response time does not leak how close a guess was
    if(not hmac.compare_digest(request.headers.get("X-Quote-Secret", "").encode(), QUOTE_SECRET.encode())):
        print("QUOTE WEBHOOK REJECTED: wrong secret")

        return JSONResponse({"error": "unauthorized"}, status_code=401)

    body: bytes | None = await guard.read_body(request)

    if(body is None):
        print("QUOTE WEBHOOK REJECTED: body is over the size cap")

        return JSONResponse({"error": "body too large"}, status_code=413)

    #the form is public, so every free text field is cleaned before any of it is used
    data: dict = clean_quote(json.loads(body))

    #blooio ids are the customer's phone number, so the quote and the texts they send after it are one conversation
    id: str = str(data.get("phone") or "")

    if(not E164_RE.fullmatch(id)):
        print("QUOTE WEBHOOK REJECTED: phone is not E.164")

        return JSONResponse({"error": "phone must be E.164"}, status_code=400)

    #the vehicle photos, as the url list a blooio picture arrives as
    attachments: list[dict] = []

    for url in data.get("photos") or []:
        if(isinstance(url, str) and url.startswith("https://")):
            attachments.append({"url": url})

    #a new quote is the customer asking to be texted back, so a conversation switched off in the dashboard is turned back on for it
    await asyncio.to_thread(unrestrict, id)

    #read by core when it answers this quote, so only the first message out gets the greeting
    write_bs(f"{id}_bstate", {"quote_greeting": quote_greeting(data)})

    #a message is text + attachments, the same as a text the customer sends over blooio
    await batcher.add_message("blooio", id, None, [quote_text(data), attachments])

    return JSONResponse({"status": "ok"})


if __name__ == "__main__":
    uvicorn.run(app, port=8000)
