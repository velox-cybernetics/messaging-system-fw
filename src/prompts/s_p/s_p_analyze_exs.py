# WINDOW TINT
def window_tint_exs() -> str:
    return r"""Yes: film on the vehicle's glass. Side windows, rear glass, front windshield, windshield brow, sunroof, shade or percentage, heat or UV rejection, price, removal, warranty, or booking a tint. "ceramic" with no mention of coating or paint means ceramic window tint. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: ceramic COATING or paint correction, PPF on the windshield, any other service, or a message that names no service ("can I book an appointment", "how much for my 2007 Tahoe").
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("how much for front", "yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"how dark can you go?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"do you guys do windows?"},"agent_response_to_user_message_0":"We do! We install ceramic window tint on all vehicles."}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"do you do ceramic coating?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"wow nice tint, what it heat reject"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Hey what’s up I’m interested in the ceramic for a 2024 Toyota Camry how much would that look like"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much to ceramic the whole suv.plus tint"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"how much for front"},"message_history":{"user_message_0":{"user_media":{"media_element_0":{"media_description(if applicable)":"brief_description: A technician applying dark tint film to a car window.\nservice_ques: Nano ceramic window tint special.\ntext_overlays: Limited 299$ special nano ceramic tint","post_description(if applicable)":"Limited time 299$ nano ceramic tint special #filthywraps #tint"}},"user_text":"let me also grab some info on this"},"agent_response_to_user_message_0":"That special is our nano ceramic tint, we tint all the side windows and rear windshield with a high heat rejection film for 299$, and it comes with a lifetime warranty.\nWant to get on the schedule for that?"}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Can you throw in a bra on the front windshield?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Toyota Camry 26"},"agent_response_to_user_message_0":"Perfect, the tint on your Camry will be 299$ for all sides and the rear. You can check out what we have open and grab a spot here https://filthy-booking-website.vercel.app"}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Can you put PPF on my windshield?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Can I book an appointment"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"How much for a 2007 Chevy Tahoe just a estimate"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{"media_element_0":{"media_description(if applicable)":"brief_description: Promotional ad for the shop, a technician applying dark window tint film to a white car.\nservice_ques: Ceramic window tint, a limited 299$ nano ceramic tint special.\ntext_overlays: Block heat. Drive cooler. Limited 299$ special nano ceramic tint","post_description(if applicable)":"Block the heat. Drive cooler. Limited time 299$ nano ceramic tint special #filthywraps #tint"}},"user_text":"Can I get more info on this?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True"""


# CLEAR PPF
def ppf_exs() -> str:
    return r"""Yes: clear PPF on the painted body. Any "PPF" or "paint protection film" with no color or windshield qualifier, "clear bra", "clear ppf", full body, full front, frontal, hood, or bumper protection, or a follow up about a PPF quote. The word "front" does NOT mean the windshield. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: colored or color change PPF, PPF or film on the windshield glass, window tint (a "bra" or "brow" on the front windshield during a tint conversation is tint), any other service, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("I got a cheaper quote", "yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{"media_element_0":{"media_description(if applicable)":"","post_description(if applicable)":"Houston’s Trusted PPF Shop 🛡️\n\n150+ ⭐️ 5-Star Reviews and counting!\n\nProtect your paint from rock chips, scratches & everyday damage with premium Paint Protection Film (PPF).\n\n📍 Serving Houston & Cypress\n• PPF | Ceramic Window Tint | Vinyl Wraps\n• Message us today for your FREE quote!\n\nProtect it. Preserve it. Filthy Wraps.\n#filthywraps #ppf #tint #houston #wrap"}},"user_text":"Can I get some info? "},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much is PPF for my car?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"I want paint protection film on the front of my car"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"I got a cheaper quote for 1500$"},"message_history":{"user_message_0":{"user_media":{},"user_text":"I have a 2020 corvette c8 I’m looking for frontal ppf"},"agent_response_to_user_message_0":"For your C8 the full frontal package will include the front bumper, full hood, full fenders, headlights, mirrors, door guards, and door cups. The price would be 1800$ which includes a free ceramic coating applied to the areas where the ppf was applied and is backed by our 10 year warranty.\nWant to get on the schedule for this?"}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Do yall install colored PPF?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Can you put PPF on my windshield?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Can you throw in a bra on the front windshield?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Toyota Camry 26"},"agent_response_to_user_message_0":"Perfect, the tint on your Camry will be 299$ for all sides and the rear. You can check out what we have open and grab a spot here https://filthy-booking-website.vercel.app"}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Sounds good, can you also tint the windows?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"How much for clear PPF on my Model 3?"},"agent_response_to_user_message_0":"For your Model 3 the full frontal package is 1500$, and that comes with a free ceramic coating on those areas and our 10 year warranty.\n\nWant to get on the schedule for this?"}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True"""


# STARLIGHT HEADLINER
def starlight_exs() -> str:
    return r"""Yes: fiber optic stars in the vehicle's ceiling. "starlight", "stars in the roof", "Rolls Royce ceiling", "galaxy roof", "fiber optic headliner", shooting stars, a star count ("1200 stars"), ambient lighting, or a follow up about a starlight quote. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: any other service, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("how many would look good", "yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"I want that Rolls Royce style ceiling with the stars"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"I’m looking to get 1200 starlight on my 2019 urus, when can I come in?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How many u think would look good in a Mustang would u have some insight or no And definitely interested in shooting star as well"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much for a full matte black wrap on a Model 3?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Can I get on the schedule"},"message_history":{}}
answer: False"""


# VINYL WRAP
def vinyl_wrap_exs() -> str:
    return r"""Yes: vinyl film that changes the color or look of the vehicle's body. "wrap my car", "vinyl wrap", "color change", matte, satin, gloss, or chrome wrap, chrome film, a hood, roof, or partial wrap, door jams, or a follow up about a wrap quote. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: PPF of any kind (clear, colored, or windshield), caliper wraps, window tint, chrome delete, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("but on the hood only", "yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"How much for a full matte black wrap on a Model 3?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"I want a full vinyl wrap, like a complete color change to satin blue on my whole car"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Full matte black wrap on the body and limo tint on all the windows"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much for window tint and a vinyl wrap?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Yeah let's do it, but on the hood only"},"message_history":{"user_message_0":{"user_media":{},"user_text":"How much for a full vinyl wrap on my Camaro?"},"agent_response_to_user_message_0":"For your Camaro the full vinyl wrap is 3000$, and that comes with a free ceramic coating and our 5 year warranty.\n\nWant to get on the schedule for that ?"}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Do yall install colored PPF?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"how much to wrap my calipers red"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"How much is PPF for my car?"},"message_history":{}}
answer: False"""


# COLORED PPF
def colored_ppf_exs() -> str:
    return r"""Yes: ONLY when the customer explicitly asks for colored PPF or color change PPF, like "colored ppf", "color change ppf", "colored clear bra", or PPF that changes the vehicle's color. Also a follow up about a colored PPF quote. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: bare "PPF" or "paint protection film" with no color qualifier (that is clear PPF), PPF on the windshield, a vinyl wrap color change, any other service, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Do yall install colored PPF?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"how much for a color change ppf on my model y"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much is PPF for my car?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"I want a full vinyl wrap, like a complete color change to satin blue on my whole car"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Can you put PPF on my windshield?"},"message_history":{}}
answer: False"""


# CERAMIC COATING / PAINT CORRECTION
def ceramic_coating_exs() -> str:
    return r"""Yes: a coating or correction on the vehicle's PAINT. "ceramic coating", "coat my car", paint correction, polishing, swirl or scratch removal from the paint, hydrophobic, 1 step or 2 step, ceramic on the rims, "ceramic the whole car" or "ceramic the whole suv", or a follow up about a coating quote. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: "ceramic" or "nano ceramic" with no mention of coating, paint, or the whole body (that is ceramic window tint), the free ceramic coating that comes with a wrap or PPF when the customer only asks about that service, any other service, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"do you do ceramic coating?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"2024 Nissan Pathfinder, what would it be for paint correction/ceramic coating?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much will be cost to do it polished from the rocks and ceramic coating?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much to ceramic the whole suv.plus tint"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"Hey what’s up I’m interested in the ceramic for a 2024 Toyota Camry how much would that look like"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"How much for the nano ceramic"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"How much is PPF for my car?"},"message_history":{}}
answer: False"""


# CALIPER WRAPS
def caliper_wrap_exs() -> str:
    return r"""Yes: changing the color of the brake calipers. "caliper wrap", "caliber wrap", "wrap my brakes", "color my calipers", brake covers, Brembo calipers, or a follow up about a caliper quote. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: a vinyl wrap on the body, ceramic coating on the rims, any other service, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"how much to wrap my calipers red"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"can yall do my brembo calipers"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much for a full matte black wrap on a Model 3?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"how much to ceramic coat my rims"},"message_history":{}}
answer: False"""


# WINDSHIELD PPF
def windshield_ppf_exs() -> str:
    return r"""Yes: ONLY when the customer explicitly asks for PPF or protective film on the windshield GLASS. "windshield ppf", "ppf on my windshield", "protect my windshield from rock chips", "film so my windshield doesnt crack", or a follow up about a windshield PPF quote. Also Yes when the customer asks what services the shop offers in general, like "what are all the services you offer".
No: tinting the windshield, a "bra" or "brow" on the front windshield during a tint conversation (that is tint), bare "PPF" or PPF on the "front" of the car (that is clear PPF on the paint), any other service, or a message that names no service.
Read `current_user_message` in light of `message_history`, never on its own: a short or vague follow up ("yeah lets do it", "that one") refers to the service already being discussed. A service discussed only in earlier turns does NOT count once the current message clearly moves on to a different one. Media in `current_user_message.user_media` counts when the customer's text points at it ("info on this"). `current_date_time` never changes the answer.
Examples:
state: {"current_user_message":{"user_media":{},"user_text":"Can you put PPF on my windshield?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"do yall do something to protect the windshield from rock chips"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"What are all the services you offer?"},"message_history":{}}
answer: True
state: {"current_user_message":{"user_media":{},"user_text":"How much to tint my front two windows and windshield?"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"I want paint protection film on the front of my car"},"message_history":{}}
answer: False
state: {"current_user_message":{"user_media":{},"user_text":"Can you throw in a bra on the front windshield?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Toyota Camry 26"},"agent_response_to_user_message_0":"Perfect, the tint on your Camry will be 299$ for all sides and the rear. You can check out what we have open and grab a spot here https://filthy-booking-website.vercel.app"}}
answer: False"""
