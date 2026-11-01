from helpers.alerts import alert_owner
from helpers import username as un
from src.rage_functions import BOOKING_LINK
from urllib.parse import urlsplit
import json, re


# SANITIZER
#control characters, a provider once sent a reply with a null between every letter
JUNK_RE: re.Pattern = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ufffd\ufeff]")

#a line that is only punctuation, like a lone "."
PUNCT_ONLY_LINE_RE: re.Pattern = re.compile(r"^[ \t]*[.,;:!?\-]+[ \t]*$", re.MULTILINE)

#"450$ ,and" becomes "450$, and"
SPACE_BEFORE_COMMA_RE: re.Pattern = re.compile(r"[ \t]+,[ \t]*")

#stray punctuation doubled up, like ",," or ".," or " ."
DOUBLE_PUNCT_RE: re.Pattern = re.compile(r"[ \t]*([,;:])[ \t]*[,;:.]+")
SPACE_BEFORE_END_RE: re.Pattern = re.compile(r"[ \t]+([.!?])(?=\s|$)")

LINE_BREAK_RUN_RE: re.Pattern = re.compile(r"[ \t]*\n[ \t\n]*")

#"- item", "• item", "* item", "1. item", "1) item"
LIST_ITEM_RE: re.Pattern = re.compile(r"^[ \t]*(?:[-•*·–]|\d+[.)])[ \t]+\S")

#the house style is 299$, "$5k" is left alone and "$1,800" stays one amount
AMOUNT: str = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?"
PREFIX_DOLLAR_RE: re.Pattern = re.compile(rf"(?<!\d)\$({AMOUNT})(?!\w|,\d)")

#em dashes read as machine written, one opening a line becomes a "- " list marker, one mid sentence becomes a comma
LEADING_EM_DASH_RE: re.Pattern = re.compile(r"^[ \t]*[\u2014\u2015][ \t]*", re.MULTILINE)
EM_DASH_RE: re.Pattern = re.compile(r"[ \t]*[,;:]?[ \t]*[\u2014\u2015]+[ \t]*")

#a dash that ended a sentence leaves a ", " before the punctuation or line end
DANGLING_COMMA_RE: re.Pattern = re.compile(r", ([.!?\n]|$)")


# GREETING GUARD
#the greeting the models open a first reply with: the time of day one, "Good evening, " with the name they sometimes put after it ("Good evening boss, "), the bare "Evening, ", or the "Hey Jailene, " and "Hi there! " kind
#the bare time of day form needs the comma right after it, so a reply like "Afternoon works, swing by after 1" is never cut, and the hey kind needs a comma or ! within 3 words of it
GREETING_RE: re.Pattern = re.compile(r"^(?:good (?:morning|afternoon|evening)(?:\s+[a-z]+(?=,))?[,.!]?|(?:morning|afternoon|evening),|(?:hey|hi|hello|hiya|howdy)(?:\s+[\w'’.-]+){0,3}?[,!])\s*", re.IGNORECASE)

#a run of spaces a removed link leaves behind
SPACE_RUN_RE: re.Pattern = re.compile(r"[ \t]{2,}")


# ADDRESS GUARD
#a house number, up to 4 name words, and a street type word, the street type keeps prices and years out of it
STREET_SUFFIXES: str = r"Dr|Drive|St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Ln|Lane|Way|Hwy|Highway|Pkwy|Parkway|Ct|Court|Cir|Circle|Loop|Ter|Terrace|Trl|Trail"
STREET_RE: re.Pattern = re.compile(rf"\b(\d{{2,6}})\s+((?:(?!\d+\s)[A-Za-z0-9.'\-]+\s+){{0,4}}?(?:{STREET_SUFFIXES})\b)", re.IGNORECASE)

#"12015 Woodworth Drive" and "6003 North Shepherd Dr" are the same places as the json's spelling
STREET_SUFFIX_CANON: dict[str, str] = {"drive": "dr", "street": "st", "road": "rd", "avenue": "ave", "boulevard": "blvd", "lane": "ln", "highway": "hwy", "parkway": "pkwy", "court": "ct", "circle": "cir", "terrace": "ter", "trail": "trl"}
DIRECTION_CANON: dict[str, str] = {"north": "n", "south": "s", "east": "e", "west": "w", "northeast": "ne", "northwest": "nw", "southeast": "se", "southwest": "sw"}


# LINK GUARD
#top level domains a phone turns into a tappable link even with no https:// in front, everyday words like "in" or "to" are left out
LINK_TLDS: str = r"com|net|org|info|biz|xyz|io|co|ly|app|dev|link|site|online|shop|store|live|top|click|club|vip|ru|cn|tk|ml|ga|cf|gq|buzz|icu|cc|ws|gl|page|ai|tv|gg|uk"

#"https://...", "www....", or a bare "site.com/path", the domain of an email is not a link
LINK_RE: re.Pattern = re.compile(rf"(?<![\w@.-])(?:(?:https?://|www\.)[^\s<>\"']+|(?:[a-z0-9-]+\.)+(?:{LINK_TLDS})\b[^\s<>\"']*)", re.IGNORECASE)

#sentence punctuation right after a link is not part of it
LINK_TRAILING: str = ".,;:!?)]}"


# LEAKED REASONING GUARD
#phrases a reply to a customer never has but the model's own reasoning does, kept narrow since "let me know" is normal wording
REASONING_LEAK_MARKERS: list[str] = ["the customer", "this is important context", "per business operations", "service details:", "draft reply", "<reply>", "</reply>", "let me respond", "let me give", "let me think", "let me analyze", "let me craft", "let me acknowledge", "let me start", "i should acknowledge", "i should let them know", "i should mention", "i should respond", "i need to convey", "i'll respond", "simple acknowledgment", "simple acknowledgement", "short and friendly", "is best here", "respond appropriately", "respond briefly", "the draft", "hard rule", "output rule", "dollar sign", "verbatim", "previous agent response", "current_user_message", "message_history", "no number was sent", "give the shop number"]

#notes the model writes to itself, only checked at the start of a sentence since "we'll keep it brief" is a real reply
SELF_INSTRUCTION_OPENERS: list[str] = ["acknowledge warmly", "acknowledge this", "acknowledge the", "keep it brief", "keep it short", "keep this brief", "be brief", "simple thanks", "no action needed", "nothing to answer", "no reply needed"]

#a self note talks about the person, a bare "they" is not enough since it usually means the services
THIRD_PERSON_SUBJECT: list[str] = ["they want", "they are asking", "they're asking", "theyre asking", "they asked", "they just", "they're just", "theyre just", "they said", "they mentioned", "they need", "they seem", "they have not", "they haven't", "they did not", "they didn't", "their message", "their question", "their vehicle is", "the user", "this person", "asking me", "telling me", "thanking me"]

SECOND_PERSON: list[str] = ["you", "your", "y'all", "yall"]


#canonical form of one address, "6003 n shepherd dr"
def address_key(number: str, street: str) -> str:
    words: list[str] = street.lower().replace(".", "").split()

    if(words):
        words[-1] = STREET_SUFFIX_CANON.get(words[-1], words[-1])

    normalized: list[str] = []

    for word in words[:-1]:
        normalized.append(DIRECTION_CANON.get(word, word))

    normalized.append(words[-1] if words else "")

    return f"{number} {' '.join(normalized)}".strip()


#the shop's real addresses from the same json the agents answer from, so they can never drift apart
def load_shop_address_keys() -> set[str]:
    with open("details-json/business_operations_details.json", "r") as file:
        b_o_details_dict: dict = json.load(file)

    keys: set[str] = set()

    for address in b_o_details_dict["b5"]["Shop Address"]:
        matches: list = STREET_RE.findall(address)

        #an address the parser can not read would block the shop's own address on every reply, so it fails at boot
        if(not matches):
            raise RuntimeError(f"shop address {address} has no street the address guard can read")

        for number, street in matches:
            keys.add(address_key(number, street))

    return keys


SHOP_ADDRESS_KEYS: set[str] = load_shop_address_keys()


#the host a link points to, "filthywraps.com" for "https://www.filthywraps.com/quote."
def link_host(link: str) -> str:
    link = link.rstrip(LINK_TRAILING)

    if("://" not in link):
        link = "https://" + link

    try:
        host: str = urlsplit(link).hostname or ""

    #a link too broken to read is never one of the shop's
    except ValueError:
        return ""

    return host.removeprefix("www.").rstrip(".")


#the shop's own links from the same json the agents answer from, plus the booking link, so a real one is never blocked
def load_shop_link_hosts() -> set[str]:
    hosts: set[str] = {link_host(BOOKING_LINK)}

    for path in ["details-json/business_operations_details.json", "details-json/service_pricing_details.json"]:
        with open(path, "r") as file:
            details_text: str = file.read()

        for link in LINK_RE.findall(details_text):
            hosts.add(link_host(link))

    return hosts


SHOP_LINK_HOSTS: set[str] = load_shop_link_hosts()


#cleans one customer bound reply before it is sent
def sanitize(text: str) -> str:
    cleaned: str = JUNK_RE.sub("", text or "")

    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")

    cleaned = PUNCT_ONLY_LINE_RE.sub("", cleaned)

    cleaned = SPACE_BEFORE_COMMA_RE.sub(", ", cleaned)

    cleaned = PREFIX_DOLLAR_RE.sub(r"\1$", cleaned)

    cleaned = LEADING_EM_DASH_RE.sub("- ", cleaned)

    cleaned = EM_DASH_RE.sub(", ", cleaned)

    cleaned = DANGLING_COMMA_RE.sub(r"\1", cleaned)

    cleaned = DOUBLE_PUNCT_RE.sub(r"\1", cleaned)

    cleaned = SPACE_BEFORE_END_RE.sub(r"\1", cleaned)

    lines: list[str] = LINE_BREAK_RUN_RE.sub("\n", cleaned).strip().split("\n")

    #one blank line between paragraphs, list items stay tight with one per line
    out: list[str] = []

    for i, line in enumerate(lines):
        if(i):
            previous: str = lines[i - 1]

            #the line under a package list stays tight to it like the owner's replies
            tight_under_list: bool = bool(LIST_ITEM_RE.match(previous))

            if(LIST_ITEM_RE.match(line) or tight_under_list):
                out.append("\n")
            else:
                out.append("\n\n")

        out.append(line)

    return "".join(out)


#the reply without the greetings that open it, "" when the greetings were all there was
def drop_greeting(text: str) -> str:
    answer: str = text or ""

    #they can stack, like "Hey P, good evening. "
    while(GREETING_RE.match(answer)):
        answer = GREETING_RE.sub("", answer, count=1)

    if(answer == ""):
        return ""

    return answer[0].upper() + answer[1:]


#the reply with its links taken out, for blooio refusing links before the customer has texted back, "" when the links were all there was
def drop_links(text: str) -> str:
    return sanitize(SPACE_RUN_RE.sub(" ", LINK_RE.sub("", text or "")))


#the first street address in the reply that is not one of the shop's, "" when there is none
def unknown_address(text: str) -> str:
    for number, street in STREET_RE.findall(text or ""):
        if(address_key(number, street) not in SHOP_ADDRESS_KEYS):
            return f"{number} {street}".strip()

    return ""


#the first link in the reply that is not one of the shop's, "" when there is none
def unknown_link(text: str) -> str:
    for link in LINK_RE.findall(text or ""):
        if(link_host(link) not in SHOP_LINK_HOSTS):
            return link.rstrip(LINK_TRAILING)

    return ""


#a short note the model wrote to itself, a blank line, then the real reply
def has_deliberation_preamble(text: str) -> bool:
    blocks: list[str] = [block.strip() for block in re.split(r"\n\s*\n", text.strip()) if block.strip()]

    if(len(blocks) < 2):
        return False

    first: str = blocks[0]

    #a long opening paragraph is a real reply
    if(len(first) > 200):
        return False

    low: str = f" {first.lower()} "

    speaks_to_customer: bool = any(f" {word}" in low or f"{word} " in low for word in SECOND_PERSON)

    talks_about_them: bool = any(word in low for word in THIRD_PERSON_SUBJECT)

    return talks_about_them and not speaks_to_customer


#true when the model's reasoning leaked into the reply
def leaked_reasoning(text: str) -> bool:
    low: str = (text or "").lower()

    for marker in REASONING_LEAK_MARKERS:
        if(marker in low):
            return True

    for sentence in re.split(r"(?:[.!?]\s+)|\n+", low):
        for opener in SELF_INSTRUCTION_OPENERS:
            if(sentence.strip().startswith(opener)):
                return True

    return has_deliberation_preamble(text or "")


#cleans the reply and blocks it when it leaks reasoning, or names an address or links somewhere that is not the shop's, "" means do not send
#first_reply is false once the shop has replied to them, the models are told to greet only on the first message but one slipped onto a later reply is cut here so it can never go out twice
def guard_reply(text: str, id: str, channel: str, first_reply: bool) -> str:
    if(text.strip() == ""):
        return ""

    cleaned: str = sanitize(text)

    if(not first_reply and GREETING_RE.match(cleaned)):
        print(f"REPEAT GREETING CUT: {cleaned}")
        print()

        #a reply that was nothing but the greeting is left alone, so the customer is never left with silence
        cleaned = drop_greeting(cleaned) or cleaned

    if(leaked_reasoning(cleaned)):
        print(f"REPLY BLOCKED, LEAKED REASONING: {cleaned}")
        print()

        alert_owner(f"REPLY BLOCKED, the model's reasoning leaked into it\nCHANNEL: {channel}\nCUSTOMER: {un.username(id, channel)}\nBLOCKED REPLY: {cleaned}\nReply to them manually")

        return ""

    address: str = unknown_address(cleaned)

    if(address != ""):
        print(f"REPLY BLOCKED, UNKNOWN ADDRESS {address}: {cleaned}")
        print()

        alert_owner(f"REPLY BLOCKED, it gave an address that is not the shop's: {address}\nCHANNEL: {channel}\nCUSTOMER: {un.username(id, channel)}\nBLOCKED REPLY: {cleaned}\nReply to them manually")

        return ""

    link: str = unknown_link(cleaned)

    if(link != ""):
        print(f"REPLY BLOCKED, UNKNOWN LINK {link}: {cleaned}")
        print()

        alert_owner(f"REPLY BLOCKED, it had a link that is not the shop's: {link}\nCHANNEL: {channel}\nCUSTOMER: {un.username(id, channel)}\nBLOCKED REPLY: {cleaned}\nReply to them manually")

        return ""

    return cleaned
