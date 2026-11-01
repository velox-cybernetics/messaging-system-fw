# SHARED NOTE
def _context_note() -> str:
    return r"""Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("cool, and the address?", "what about email?", "and on sunday?") asks about whatever the earlier turns point it at. A field asked about only in earlier turns does NOT count once the current message moves on to a different one. A field mentioned only to rule it out ("I don't need the phone") does NOT count. `current_date_time` never changes the answer."""


# HOURS OF OPERATIONS (b1)
def hours_exs() -> str:
    return r"""Yes: when the shop is open or closed. Hours, open or closing time, open today, tomorrow, this weekend, or right now, "yall have time right now".
No: how long a service takes (turnaround), booking a specific time slot, how long the shop has been in business, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Hey you guys open on Saturday?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"yall open tmr and saturday"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"yall open today?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are your hours and what's the address?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Are you open right now? Forget the address, I'll use GPS."},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How long has Filthy Wraps been around?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Cool, and the address?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Hey you guys open on Saturday?"},"agent_response_to_user_message_0":"Hey, we run Mon-Sat 10AM to 5PM and Sundays we are CLOSED. So Saturdays we are open 10 to 5."}}
answer: False"""


# YEARS IN BUSINESS (b2)
def years_in_business_exs() -> str:
    return r"""Yes: how long the shop has been operating or when it started. "how long have you been around", "when did you start", "how long has he been running it", experience as a shop.
No: how long a service takes, hours, who owns the shop, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"How long has Filthy Wraps been around?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Who owns the shop and how long have they been doing this?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"And how long has he been running it?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Whos the owner over there?"},"agent_response_to_user_message_0":"Hey, the shop is run by Preston Van Norton, CEO."}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How long does a full wrap take?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Who's the owner of the shop?"},"message_history":{}}
answer: False"""


# BUSINESS NAME (b3)
def business_name_exs() -> str:
    return r"""Yes: confirming or asking the name of the shop. "is this Filthy Wraps", "what's this place called", "did I reach the right shop", "is this the right number for Filthy Wraps".
No: asking for the phone number to call, the owner's name, the name of the person they are talking to, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Is this the right number for Filthy Wraps?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"what's the name of this shop"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Best number to call for a quote?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"who was I talking to so I can know who to talk to when I get there"},"message_history":{}}
answer: False"""


# OWNER (b4)
def owner_exs() -> str:
    return r"""Yes: who owns or runs the shop. "who's the owner", "who runs the shop", "can I speak to the owner", "who started this".
No: how many people work there, the name of the person they are talking to, how long the shop has been around, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Who's the owner of the shop?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Who owns the shop and how long have they been doing this?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How big is your crew over there?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"And how long has he been running it?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Whos the owner over there?"},"agent_response_to_user_message_0":"Hey, the shop is run by Preston Van Norton, CEO."}}
answer: False"""


# SHOP ADDRESS (b5)
def address_exs() -> str:
    return r"""Yes: the physical location of the shop. "where are you located", "what's your address", "how do I get there", "what city are you in", "GPS isn't finding you".
No: "where can I find you online" (that is the website), an address they ruled out ("forget the address"), or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"What's your address? GPS isn't finding you."},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What's your address, like the actual street location of the shop?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are your hours and what's the address?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Cool, and the address?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Hey you guys open on Saturday?"},"agent_response_to_user_message_0":"Hey, we run Mon-Sat 10AM to 5PM and Sundays we are CLOSED. So Saturdays we are open 10 to 5."}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Where can I find you online?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Are you open right now? Forget the address, I'll use GPS."},"message_history":{}}
answer: False"""


# CONTACT PHONE (b6)
def phone_exs() -> str:
    return r"""Yes: the phone number to call or text. "phone number", "what's your number", "best number to reach you", "contact" or "reach you" with no channel named.
No: an email address, a phone number they ruled out ("I don't need the phone"), or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Best number to call for a quote?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Phone number, email, and website please"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"how can I contact you guys"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"I don't need the phone, just give me the email"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"What about email?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Whats the best number to reach you guys at?"},"agent_response_to_user_message_0":"Hey, the best number is (737) 203-6990, calls or texts both work."}}
answer: False"""


# CONTACT EMAIL (b7)
def email_exs() -> str:
    return r"""Yes: an email address to send a message or pictures to. "email address", "where do I email", "is there an email".
No: the phone number, the website, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Do you have an email I can send pictures to?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"I don't need the phone, just give me the email"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What about email?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Whats the best number to reach you guys at?"},"agent_response_to_user_message_0":"Hey, the best number is (737) 203-6990, calls or texts both work."}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Best number to call for a quote?"},"message_history":{}}
answer: False"""


# WEBSITE (b8)
def website_exs() -> str:
    return r"""Yes: the shop's website or finding it online. "do you have a website", "what's your URL", "online quote form", "where can I find you online".
No: the physical address, social media handles, the email, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Got a website I can browse?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Where can I find you online?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Phone number, email, and website please"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What's your address? GPS isn't finding you."},"message_history":{}}
answer: False"""


# NUMBER OF EMPLOYEES (b9)
def employees_exs() -> str:
    return r"""Yes: how many people work at the shop. "how many people work there", "size of your team", "how many installers", "how big is the crew".
No: who owns the shop, the name of the person they are talking to, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"How big is your crew over there?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"how many installers yall got"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Who's the owner of the shop?"},"message_history":{}}
answer: False"""


# BUSINESS LICENSE (b10)
def license_exs() -> str:
    return r"""Yes: whether the shop is licensed, registered, or legit. "are you licensed", "license number", "registered business", "legitimate operation".
No: warranty questions, whether tint is street legal, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Are you guys licensed and registered?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Same one, whats the license number?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Are you guys licensed and registered?"},"agent_response_to_user_message_0":"Yeah, we are registered in the state of Texas."}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"is the tint legal in texas"},"message_history":{}}
answer: False"""


# NAME OF PERSON TALKING TO (b11)
def person_talking_to_exs() -> str:
    return r"""Yes: who the customer is talking to right now, or if they are talking to a real person or a bot. "who am I talking to", "who was I talking to", "what's your name", "is this preston", "am i talking to a bot".
No: who owns the shop, the name of the shop, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"roger tha chief, thanks for the help, also who was I talking to so I can know who to talk to when I get there"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Lets get me in this Friday"},"agent_response_to_user_message_0":"Bet, you can check out what we got open Friday and lock in a time here: https://filthy-booking-website.vercel.app"}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"whats your name btw"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"r u a bot lol"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Who's the owner of the shop?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Is this the right number for Filthy Wraps?"},"message_history":{}}
answer: False"""


# PAYMENTS ACCEPTED (b12)
def payments_exs() -> str:
    return r"""Yes: which payment methods the shop accepts, or whether there is tax. "do you take card", "can I pay cash", "do yall take zelle", "is there tax on that".
No: financing or payment plans, the price of a service, deposits, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"do yall take card or cash only"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"is there tax on top of that"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"do you guys do financing"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"how much is the deposit"},"message_history":{}}
answer: False"""


# SOCIAL MEDIA (b13)
def social_media_exs() -> str:
    return r"""Yes: the shop's social media, like its instagram, tiktok, or facebook. "whats yall ig", "what's your insta", "yall got a tiktok", "do yall have a facebook page".
No: the website, the email, or any other field.
""" + _context_note() + r"""
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"whats yall ig"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"yall got a tik tok?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Got a website I can browse?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Where can I find you online?"},"message_history":{}}
answer: False"""
