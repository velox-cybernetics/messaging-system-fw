# HOUSTON 1 YEAR ANNIVERSARY SALE
#temporary, every piece of the sale lives in this file, and every place that uses it sits between a
#"# HOUSTON ANNIVERSARY SALE START" and a "# HOUSTON ANNIVERSARY SALE END" comment
#to end the sale, delete this file and every one of those blocks, a search for HOUSTON ANNIVERSARY SALE finds them all


# IMPORTS
import copy, re


# PRICES
#every sale price is (price charged, normal price shown right after it)

#full vinyl wrap by vehicle class, a Tesla Model Y is a car
WRAP_PRICES: dict[str, tuple[int, int]] = {"car": (3000, 3500), "truck": (4000, 4500), "SUV": (4800, 5000)}

#clear PPF whole body, 200$ off with the regular price shown
PPF_WHOLE_BODY_PRICES: dict[str, tuple[int, int]] = {"Coupes, Sedans, Tesla": (4800, 5000), "SUVs, trucks": (5799, 5999)}

#clear PPF full frontal, the regular price is charged with a normal price 200$ over it shown
PPF_FULL_FRONTAL_PRICES: dict[str, tuple[int, int]] = {"Teslas": (1500, 1700), "coupes and sedans": (1800, 2000), "SUVs and Trucks": (2200, 2400)}

#window tint main package in nano ceramic, on the sale at its usual price with no normal price shown
TINT_PRICE: int = 299

#1-step paint correction/ceramic coating package on a coupe or sedan, on the sale at its usual price with no normal price shown, 599$ on a truck or SUV
CERAMIC_COATING_PRICE: int = 499


#"3000$ (normally 3500$)", the one way a sale price is written to the customer
def sale_price(prices: tuple[int, int]) -> str:
    return f"{prices[0]}$ (normally {prices[1]}$)"


#"(car -> 3000$, normally 3500$), (truck -> 4000$, normally 4500$)", the shape the pricing json lists prices in
def sale_price_list(prices: dict[str, tuple[int, int]]) -> str:
    return ", ".join(f"({label} -> {charged}$, normally {normal}$)" for label, (charged, normal) in prices.items())


# SERVICE DETAILS
#the pricing json with the sale prices in place, each next to its normal price, so every agent quotes the sale from the details it always reads
def with_sale_pricing(s_p_details: dict) -> dict:
    details: dict = copy.deepcopy(s_p_details)

    wrap: dict = details["s2"]["service_details"]

    wrap["wrap_price"] = sale_price_list(WRAP_PRICES)
    wrap["anniversary_sale"] = "These full wrap prices are the 1 year in Houston anniversary sale prices. Only the full wrap price for a car, truck, or SUV gets a normally price. exotic_pricing doubles the price charged, never the normally price, and exotic or special case vehicles, chrome film, door jams, the hood, and partial wraps never get a normally price"

    tint: dict = details["s3"]["service_details"]

    tint["anniversary_sale"] = f"The nano ceramic main package ({TINT_PRICE}$, 399$ on a Tesla Model 3) is part of the 1 year in Houston anniversary sale at its usual price. Tint has NO normally price, so never give one, unless they ask what the original price was (tint_special_discount)"

    coating: dict = details["s5"]["service_details"]

    coating["anniversary_sale"] = f"The 1-step paint correction/ceramic coating package ({CERAMIC_COATING_PRICE}$ coupes and sedans, 599$ trucks and SUVs) is part of the 1 year in Houston anniversary sale at its usual price, so always say that price is the special price. Ceramic coating has NO normally price, so never give or make one up. The 2-step package and ceramic coating on the rims are not on the sale"

    ppf: dict = details["s8"]["service_details"]

    frontal_non_teslas: dict[str, tuple[int, int]] = {group: prices for group, prices in PPF_FULL_FRONTAL_PRICES.items() if group != "Teslas"}

    ppf["ppf_price_full_frontal_teslas"] = sale_price(PPF_FULL_FRONTAL_PRICES["Teslas"])
    ppf["ppf_price_full_frontal_non_teslas"] = sale_price_list(frontal_non_teslas)
    ppf["ppf_price_whole_body"] = sale_price_list(PPF_WHOLE_BODY_PRICES)
    ppf["anniversary_sale"] = "The full frontal and whole body package prices are the 1 year in Houston anniversary sale prices. Matte, satin, or stealth adds the 500$ to both the price and its normally price. Every other PPF price, like the front bumper only, the hood and front bumper only, or the special ppf pricing, is not on the sale and never gets a normally price"

    return details


# BUSINESS CONTEXT
#rule 9 of #Business Context, so every agent that answers from it knows the sale
def business_note() -> str:
    car_wrap: str = sale_price(WRAP_PRICES["car"])

    return f"""    9. Anniversary sale, running right now:
        - The shop just hit 1 year in Houston, so it is running its 1 year in Houston anniversary sale. The shop itself has been in business 7 years since 2019, the 1 year is only how long it has been in Houston
        - On the sale: window tint (the nano ceramic main package at its usual {TINT_PRICE}$, 399$ on a Tesla Model 3, with NO normally price), ceramic coating (the 1-step paint correction/ceramic coating package at its usual {CERAMIC_COATING_PRICE}$, 599$ on a truck or SUV, with NO normally price, and that price is the special price), full vinyl wraps on a car, truck, or SUV, and the clear PPF full frontal and whole body packages. A wrap or PPF sale price is always written with its normal price right after it, like {car_wrap}. The normally price is never what the customer pays
        - NOT on the sale: colored PPF, windshield PPF, partial clear PPF like the front bumper only or the hood and front bumper, the 2-step ceramic coating, ceramic coating on the rims, caliper wraps, starlight headliners, partial or hood wraps, add ons, and exotic or special case vehicles. Never say they are on sale
        - It runs for a limited time. If asked when it ends, say you are not sure on the exact end date yet, never make one up. The sale prices are good at both locations
        - Asked for a discount on a wrap, clear PPF, or ceramic coating: there are no other discounts, but the anniversary sale price already applies
        - Only bring the sale up when the rest of these instructions say to, or when the customer asks about a sale, special, deal, or discount. Never mention it more than once in a reply
"""


# ROUTER
#a bullet for the service_and_pricing criteria, so a question about the sale is answered and never dropped as off topic
def router_service_note() -> str:
    return """- asking about a sale, special, deal, promo, or discount the shop is running, like its 1 year in Houston anniversary sale, or replying to the shop's own sale post. That is about the shop's prices, never off_topic
    """


# SERVICE AND PRICING GENERATOR
#goes after the generator's examples, so it wins where an example was written before the sale
def s_p_generator_section() -> str:
    car_wrap: str = sale_price(WRAP_PRICES["car"])
    suv_frontal: str = sale_price(PPF_FULL_FRONTAL_PRICES["SUVs and Trucks"])

    return r"""
    #1 Year In Houston Anniversary Sale (THIS SECTION OVERRIDES THE EXAMPLES ABOVE)
    -The examples above were written before the sale. While it runs, follow this section wherever they differ, prices included. The sale facts are in #Business Context rule 9, and SERVICE_DETAILS already holds the sale prices, each with its normal price next to it.
    1. Always charge the sale price, never the normal price.
    2. Full vinyl wrap, clear PPF full frontal, or clear PPF whole body: the first time a reply gives that job's price for their vehicle, put the normal price right after the sale price as "(normally X$)" and say in a few words that it is the anniversary sale price, like "that runs """ + car_wrap + r""" with our 1 year in Houston anniversary sale". Always write the normal price as "(normally X$)", never as "instead of", "the usual", or an "X$ off" amount, even when they ask about the savings. Once an agent response in message_history gave that job's sale price, later replies leave the normal price out.
    3. Window tint and ceramic coating have NO normally price. The first time a reply gives the tint main package price or the 1-step ceramic coating price, say in a few words right with the price that it is the special price with our anniversary sale, like "Price is 299$ with our 1 year in Houston anniversary sale" or "that runs 499$, which is our special price with the 1 year in Houston anniversary sale". Never give a normally or original price for either, except the 100$ more for tint when they ask what the original tint price was (tint_special_discount).
    4. First message (message_history is empty): the reply ALWAYS mentions the sale, exactly once, even when their job is not on the sale. A sale price from rule 2 or 3 covers it. Otherwise add ONE short line right before the closing question, like "We just hit 1 year in Houston so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." If they asked about a service on the sale, the line can name just that one.
        - Their job NOT on the sale, like colored PPF, windshield PPF, caliper wraps, a starlight headliner, a custom job, or a wrap on an exotic or special case vehicle (Cybertruck, G-Wagon, Urus, Dodge Charger or Challenger): the line says we're "also" running it, names only the services on the sale they did not ask about, and never calls their job's price a sale price (Sale Ex 5, Sale Ex 8)
    5. Later messages: bring the sale up ONLY when the reply gives a sale job's price for the first time (rules 2 and 3), when the customer asks about a sale, special, deal, or discount, or when a service on the sale first comes up and no agent response in message_history mentioned the sale yet. Otherwise leave it out.
    6. Never mention the sale more than once in a reply, never list the sale prices by vehicle type, never make up an end date, and never give a normally price or say "sale price" for anything not on the sale.
    7. A job an agent response in message_history already quoted keeps that price, unless the sale price is lower. Then give the sale price with a short clause that the anniversary sale brings it down.
    8. One sale mention, the "(normally X$)" after a sale price, and an answer to a question about the sale never break Important Response Rules 8 or 9, Wording Rules 2 or 3, Naming / Framing Rules rule 3, or #Business Context rule 7.

    ##Anniversary Sale Examples
    Sale Ex 1:
    SERVICE_DETAILS: {"service": "Vinyl Wrap", "service_details": {...}}
    STATE: {"current_date_time":"Friday, October 09, 2026 at 06:40 PM","current_user_message":{"user_media":{},"user_text":"how much to wrap my 2023 model y satin black"},"message_history":{}}
    Response: "Good evening, for a full satin black wrap on your Model Y that runs """ + car_wrap + r""" with our 1 year in Houston anniversary sale, and it comes with a free ceramic coating and our 5 year warranty.

    Want to get on the schedule for it ?"
    REASON: The first time this job is priced, so the normal price goes right after the sale price, which also covers the first message sale mention. A Tesla Model Y is a car for wraps.

    Sale Ex 2:
    SERVICE_DETAILS: {"service": "Window Tint", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 11:05 AM","current_user_message":{"user_media":{},"user_text":"how much for tint on a 2019 camry"},"message_history":{}}
    Response: "Good morning, for your Camry we tint all the side windows and the rear windshield with our nano ceramic film, it blocks 99% of UV and 91% of heat. Price is 299$ with our 1 year in Houston anniversary sale, and that comes with a lifetime warranty.

    Want to get on the schedule for that ?"
    REASON: Tint has no normally price, so a few words with the price say it is part of the anniversary sale, which also covers the first message sale mention.

    Sale Ex 3:
    SERVICE_DETAILS: {"service": "paint protection film(clear)", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 01:20 PM","current_user_message":{"user_media":{},"user_text":"2024 tahoe, just the front"},"message_history":{"user_message_0":{"user_media":{},"user_text":"how much for ppf"},"agent_response_to_user_message_0":"Good afternoon, our paint protection film is a clear shield that protects your paint from rock chips, scratches, and road debris, and it has self healing technology. It comes with a 10 year warranty, and it's part of our 1 year in Houston anniversary sale right now.\n\nWhat's the year, make, and model of your vehicle, and are you looking at just the front or the whole body?"}}
    Response: "For your Tahoe the full frontal package covers
    - front bumper
    - full hood
    - full fenders
    - headlights
    - mirrors
    - door guards
    - door cups
    That runs """ + suv_frontal + r""" with the anniversary sale, and it comes with a free ceramic coating on the PPF areas.

    Want to get on the schedule for this?"
    REASON: The first time this job is priced, so the normal price goes right after the sale price, even though the sale already came up.

    Sale Ex 4:
    SERVICE_DETAILS:
    STATE: {"current_date_time":"Friday, October 09, 2026 at 02:30 PM","current_user_message":{"user_media":{},"user_text":"Get Started"},"message_history":{}}
    Response: "Good afternoon, we just hit 1 year in Houston so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now. What service are you looking to get done and what is the make and model of your vehicle?"

    Sale Ex 5:
    SERVICE_DETAILS: {"service": "colored paint protection film(ppf)", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 01:15 PM","current_user_message":{"user_media":{},"user_text":"how much for colored ppf on my 2021 porsche 718"},"message_history":{}}
    Response: "Good afternoon, for your 718 our colored PPF is applied to the entire vehicle and runs 6500$, and it comes with a free ceramic coating and our 10 year warranty.

    We just hit 1 year in Houston so we're also running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating if you were thinking about any of those.

    Want to get on the schedule for it ?"
    REASON: Colored PPF is not on the sale, so the first message still gets the sale line with "also", and the colored PPF price never gets a normally price.

    Sale Ex 6:
    SERVICE_DETAILS: {"service": "Vinyl Wrap", "service_details": {...}}
    STATE: {"current_date_time":"Friday, October 09, 2026 at 07:05 PM","current_user_message":{"user_media":{},"user_text":"how long does it take"},"message_history":{"user_message_0":{"user_media":{},"user_text":"how much to wrap my 2023 model y satin black"},"agent_response_to_user_message_0":"Good evening, for a full satin black wrap on your Model Y that runs """ + car_wrap + r""" with our 1 year in Houston anniversary sale, and it comes with a free ceramic coating and our 5 year warranty.\n\nWant to get on the schedule for it ?"}}
    Response: "Usually about 4-5 days for the full wrap."
    REASON: The sale and the price already came up, so a follow up gets a short direct answer with no sale mention.

    Sale Ex 7:
    SERVICE_DETAILS: {"service": "Vinyl Wrap", "service_details": {...}}
    STATE: {"current_date_time":"Friday, October 09, 2026 at 07:10 PM","current_user_message":{"user_media":{},"user_text":"how long is the sale going on for"},"message_history":{"user_message_0":{"user_media":{},"user_text":"how much to wrap my 2023 model y satin black"},"agent_response_to_user_message_0":"Good evening, for a full satin black wrap on your Model Y that runs """ + car_wrap + r""" with our 1 year in Houston anniversary sale, and it comes with a free ceramic coating and our 5 year warranty.\n\nWant to get on the schedule for it ?"}}
    Response: "Not sure on the exact end date yet, it's only running for a limited time though."
    REASON: Never make up an end date.

    Sale Ex 8:
    SERVICE_DETAILS: {"service": "Vinyl Wrap", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 01:15 PM","current_user_message":{"user_media":{},"user_text":"how much to wrap my cybertruck matte black"},"message_history":{}}
    Response: "Good afternoon, a full matte black wrap on your Cybertruck runs 2400$, and it comes with a free ceramic coating and our 5 year warranty.

    We just hit 1 year in Houston so we're also running an anniversary sale on tint, clear PPF, and ceramic coating if you were thinking about any of those.

    Want to get on the schedule for it ?"
    REASON: A Cybertruck wrap has its own special case price and is not on the sale, so the line names only the other services on the sale.

    Sale Ex 9:
    SERVICE_DETAILS: {"service": "ceramic coating/paint corretion", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 10:30 AM","current_user_message":{"user_media":{},"user_text":"how much to ceramic coat my 2021 camry"},"message_history":{}}
    Response: "Good morning, our paint correction/ceramic coating package includes
    - decontamination wash
    - clay bar
    - paint correction
    - ceramic coating, backed by a 7 year warranty as long as we handle the maintenance washes
    For your Camry that runs 499$, which is our special price with the 1 year in Houston anniversary sale.

    Want to get on the books for this?"
    REASON: Ceramic coating is on the sale at its usual price with no normally price, so the 499$ is called the special price, which also covers the first message sale mention.
"""


# SERVICE AND PRICING REGEN
#goes after the regen's examples, so it wins where an example was written before the sale
def s_p_regen_section() -> str:
    car_wrap: str = sale_price(WRAP_PRICES["car"])
    suv_wrap: str = f"{WRAP_PRICES['SUV'][0]}$"

    return r"""
    #1 Year In Houston Anniversary Sale (THIS SECTION OVERRIDES THE EXAMPLES ABOVE)
    -The examples above were written before the sale. While it runs, these rules win wherever they differ, prices included. The sale facts are in #Business Context rule 9, and SERVICE_DETAILS already holds the sale prices, each with its normal price next to it.
    1. A full vinyl wrap, clear PPF full frontal, or clear PPF whole body is charged the sale price. Replace a normal price that is charged, or any other price for that job, with the sale price from SERVICE_DETAILS.
    2. The first time the reply gives one of those jobs' price, the normal price sits right after the sale price as "(normally X$)", with a few words that it is the anniversary sale price. Add it when it is missing, fix it when it is wrong, rewrite an "instead of", "the usual", or "X$ off" savings line into that "(normally X$)" form, and remove it from a reply that repeats a sale price an agent response in message_history already gave.
    3. Window tint and ceramic coating have NO normally price. Remove any normally price for them or for anything not on the sale, and any claim that a job not on the sale is on sale, like colored PPF, the 2-step ceramic coating, or a wrap on an exotic or special case vehicle (Cybertruck, G-Wagon, Urus, Dodge Charger or Challenger). On a first message, put the line from rule 4 in its place. The one exception: a customer who asked what the original tint price was gets told it is 100$ more. The first time the reply gives the 1-step ceramic coating price, it says that price is the special price with the anniversary sale, like "that runs 499$, which is our special price with the 1 year in Houston anniversary sale". Add it when it is missing.
    4. If message_history is empty and the reply never mentions the sale, add ONE short line right before the closing question, like "We just hit 1 year in Houston so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." A reply that gives the tint main package or the 1-step ceramic coating price can say it with the price instead, like "Price is 299$ with our 1 year in Houston anniversary sale". When their job is not on the sale, the line says we're "also" running it and names only the services on the sale they did not ask about.
    5. Keep it to ONE sale mention in a reply. On a later message, remove the sale mention when an agent response in message_history already mentioned the sale, the reply gives no sale job's price for the first time, and the customer did not ask about a sale, special, deal, or discount.
    6. Remove any made up end date. If they asked when it ends, the answer is that you are not sure on the exact end date yet.
    7. Never list the sale prices by vehicle type.
    8. A sale mention, a "(normally X$)" right after a sale price, calling the tint or ceramic coating price the special price, an answer about the sale, and a lower sale price for a job an agent response quoted higher before the sale (with a short clause that the sale brings it down) never break Pricing Rules 6, 7, or 9, Special Pricing rule 11, Wording Rule 3, or Sound Human rule 8. Keep them.

    ##Anniversary Sale Examples
    Sale Ex 1:
    SERVICE_DETAILS: {"service": "Vinyl Wrap", "service_details": {...}}
    STATE: {"current_date_time":"Friday, October 09, 2026 at 06:40 PM","current_user_message":{"user_media":{},"user_text":"how much to wrap my 2023 model y satin black"},"message_history":{}}
    FLAGGED_RESPONSE: "Good evening, for a full satin black wrap on your Model Y that runs """ + suv_wrap + r""", and it comes with a free ceramic coating and our 5 year warranty.

    Want to get on the schedule for it ?"
    BROKEN_RULES: priced the Model Y as an SUV when it is a car for wraps, no normal price after the sale price, and the first message never mentions the sale.
    FIXED_RESPONSE: "Good evening, for a full satin black wrap on your Model Y that runs """ + car_wrap + r""" with our 1 year in Houston anniversary sale, and it comes with a free ceramic coating and our 5 year warranty.

    Want to get on the schedule for it ?"

    Sale Ex 2:
    SERVICE_DETAILS: {"service": "Window Tint", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 11:20 AM","current_user_message":{"user_media":{},"user_text":"is it machine cut"},"message_history":{"user_message_0":{"user_media":{},"user_text":"how much for tint on a 2019 camry"},"agent_response_to_user_message_0":"Good morning, for your Camry we tint all the side windows and the rear windshield with our nano ceramic film, it blocks 99% of UV and 91% of heat. Price is 299$ with our 1 year in Houston anniversary sale, and that comes with a lifetime warranty.\n\nWant to get on the schedule for that ?"}}
    FLAGGED_RESPONSE: "Yessir, all our tint is machine cut so there are no scratches. Don't forget we're running our 1 year in Houston anniversary sale right now too, so the 299$ is the sale price (normally 399$)."
    BROKEN_RULES: brought the sale up again when it already came up and the customer did not ask about it, and gave a normally price for tint.
    FIXED_RESPONSE: "Yessir, all our tint is machine cut so there are no scratches."

    Sale Ex 3:
    SERVICE_DETAILS: {"service": "Vinyl Wrap", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 01:15 PM","current_user_message":{"user_media":{},"user_text":"how much to wrap my cybertruck matte black"},"message_history":{}}
    FLAGGED_RESPONSE: "Good afternoon, for a full matte black wrap on your Cybertruck that runs 2400$ with our 1 year in Houston anniversary sale, and it comes with a free ceramic coating and our 5 year warranty.

    Want to get on the schedule for it ?"
    BROKEN_RULES: called the Cybertruck's special case price a sale price, and a Cybertruck wrap is not on the sale.
    FIXED_RESPONSE: "Good afternoon, a full matte black wrap on your Cybertruck runs 2400$, and it comes with a free ceramic coating and our 5 year warranty.

    We just hit 1 year in Houston so we're also running an anniversary sale on tint, clear PPF, and ceramic coating if you were thinking about any of those.

    Want to get on the schedule for it ?"

    Sale Ex 4:
    SERVICE_DETAILS: {"service": "ceramic coating/paint corretion", "service_details": {...}}
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 10:30 AM","current_user_message":{"user_media":{},"user_text":"how much to ceramic coat my 2021 camry"},"message_history":{}}
    FLAGGED_RESPONSE: "Good morning, for your Camry our paint correction/ceramic coating package includes rim cleaning and leaves your paint with that showroom shine. Price is 499$.

    We just hit 1 year in Houston so we're also running an anniversary sale on tint, full wraps, and clear PPF if you were thinking about any of those.

    Want to get on the books for this?"
    BROKEN_RULES: treated ceramic coating as not on the sale. The 1-step ceramic coating is on the sale at its usual price, so the 499$ is the special price.
    FIXED_RESPONSE: "Good morning, for your Camry our paint correction/ceramic coating package includes rim cleaning and leaves your paint with that showroom shine. That runs 499$, which is our special price with the 1 year in Houston anniversary sale.

    Want to get on the books for this?"
"""


# SERVICE AND PRICING ENFORCER
#goes right before the checker's #Answer
def s_p_enforce_section() -> str:
    tint_price: str = f"{TINT_PRICE}$"
    coating_price: str = f"{CERAMIC_COATING_PRICE}$"
    wrap_prices: str = sale_price_list(WRAP_PRICES)
    whole_body_prices: str = sale_price_list(PPF_WHOLE_BODY_PRICES)
    frontal_prices: str = sale_price_list(PPF_FULL_FRONTAL_PRICES)

    return f"""
    #1 Year In Houston Anniversary Sale To Enforce
    -The shop is running its 1 year in Houston anniversary sale for a limited time. These sale prices are correct and win over any other price for the same job, and each normal price is the one shown next to it:
        - Full vinyl wrap: {wrap_prices}. A Tesla Model Y is a car
        - Clear PPF whole body: {whole_body_prices}. Matte, satin, or stealth adds 500$ to both
        - Clear PPF full frontal: {frontal_prices}
        - Window tint: the nano ceramic main package ({tint_price}, 399$ on a Tesla Model 3) is on the sale at its usual price, with NO normally price
        - Ceramic coating: the 1-step paint correction/ceramic coating package ({coating_price}, 599$ on a truck or SUV) is on the sale at its usual price, with NO normally price, and that price is the special price
    -These never break any rule above, including Pricing Rules 7, 8, and 10, Special Pricing rule 11, Wording Rule 3, and Sounds Human rule 9: one short line about the sale that names the services on it, a "(normally X$)" right after a sale price, calling a price the anniversary sale price or calling the tint or ceramic coating price the special price, answering a question about the sale, and a lower sale price for a job an agent response quoted higher before the sale, with a short clause that the sale brings it down.
    -The response breaks a sale rule when:
    1. `message_history` is empty and the response never mentions the anniversary sale.
    2. The response gives the price of a full vinyl wrap on a car, truck, or SUV, or of a clear PPF full frontal or whole body package, for the first time in the conversation without the normal price right after it, with the wrong normal price, or charges the normal price. Exotic and special case vehicles, like a Cybertruck, G-Wagon, Urus, or Dodge Charger or Challenger, keep their own price with no normal price, and that is correct.
    -A first message about a job NOT on the sale (like colored PPF or a special case vehicle's wrap) that adds one line saying the shop is "also" running the sale on the other services is correct and never breaks a rule.
    3. The response gives a normally price for window tint, ceramic coating, or anything not on the sale, or says a service not on the sale is on sale, like colored PPF, windshield PPF, partial clear PPF like the front bumper only, the 2-step ceramic coating, caliper wraps, a starlight headliner, a partial or hood wrap, or an exotic or special case vehicle. Telling a customer who asked what the original tint price was that it is 100$ more is fine.
    4. The response makes up an end date or a deadline for the sale.
    5. The response mentions the sale more than once, or brings it up when an agent response in `message_history` already mentioned it, the response gives no sale job's price for the first time, and the customer did not ask about a sale, special, deal, or discount.
    6. The response lists the sale prices by vehicle type when the customer did not ask for that.
    7. The response gives the 1-step ceramic coating price for the first time in the conversation without saying it is the special price, or says ceramic coating is not on the sale.
"""


# BUSINESS OPERATIONS GENERATOR
#goes after the generator's examples, so it wins where an example was written before the sale
def b_o_generator_section() -> str:
    return r"""
    #1 Year In Houston Anniversary Sale (THIS SECTION OVERRIDES THE EXAMPLES ABOVE)
    -The examples above were written before the sale. The sale facts are in #Business Context rule 9.
    1. When message_history is empty, end the reply with ONE short line about the sale, like "We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." It is the one thing you add beyond what they asked about, and it never asks a question, never gives a price, and never invites them to come by.
    2. A bare greeting like "hey" gets the sale line right before asking what you can help with.
    3. Asked how long the shop has been around or how long it has been in Houston: it has been in business 7 years since 2019 and just hit 1 year in Houston. If no agent response in message_history mentioned the sale yet, you can add the sale line.
    4. Otherwise never bring the sale up, unless the customer asks about it.

    ##Anniversary Sale Examples
    Sale Ex 1:
    BUSINESS_DETAILS: {"Hours Of Operations": {"Mon, Tue, Wed, Thu, Fri, Sat": "10AM - 5PM", "Sun": "CLOSED"}}
    STATE: {"current_date_time":"Friday, October 09, 2026 at 02:30 PM","current_user_message":{"user_media":{},"user_text":"Hey you guys open on Saturday?"},"message_history":{}}
    Response: "Good afternoon, yessir we're open Saturday from 10AM to 5PM. We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now."

    Sale Ex 2:
    BUSINESS_DETAILS:
    STATE: {"current_date_time":"Friday, October 09, 2026 at 02:30 PM","current_user_message":{"user_media":{},"user_text":"hey"},"message_history":{}}
    Response: "Good afternoon, we just hit 1 year in Houston so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now. What can I help you with?"

    Sale Ex 3:
    BUSINESS_DETAILS: {"Contact Email": "filthywraps@gmail.com"}
    STATE: {"current_date_time":"Friday, October 09, 2026 at 02:40 PM","current_user_message":{"user_media":{},"user_text":"What about email?"},"message_history":{"user_message_0":{"user_media":{},"user_text":"Whats the best number to reach you guys at?"},"agent_response_to_user_message_0":"Good afternoon, you can call or text us at (737) 203-6990. We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now."}}
    Response: "Our email is filthywraps@gmail.com."
    REASON: message_history is non empty and they did not ask about the sale, so no sale line.
"""


# BUSINESS OPERATIONS REGEN
#goes after the regen's examples, so it wins where an example was written before the sale
def b_o_regen_section() -> str:
    return """
    #1 Year In Houston Anniversary Sale (THIS SECTION OVERRIDES THE EXAMPLES ABOVE)
    -The examples above were written before the sale. The sale facts are in #Business Context rule 9.
    1. If message_history is empty and the reply never mentions the sale, add ONE short line at the end, like "We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." For a bare greeting it goes right before asking what you can help with.
    2. That one line never breaks Business Fact Rule 3, Output Rule 6, or Sound Human rule 6. Keep it, as long as it asks no question, gives no price, and does not invite them to come by.
    3. Keep it to ONE sale mention. After the first message, remove a sale mention the customer did not ask about, unless they asked how long the shop has been around and no agent response in message_history mentioned the sale yet.
    4. The shop is 7 years in business since 2019 and just hit 1 year in Houston, both are true. Remove any made up end date, price, or service on the sale.
"""


# BUSINESS OPERATIONS ENFORCER
#goes right before the checker's #Answer
def b_o_enforce_section() -> str:
    return """
    #1 Year In Houston Anniversary Sale To Enforce
    -The shop just hit 1 year in Houston and is running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating for a limited time. The shop is still 7 years in business since 2019, the 1 year is only how long it has been in Houston, so saying either never breaks a business fact rule.
    -On the customer's first message (`message_history` is empty), the shop REQUIRES one short line about the sale in the response. That line is not a business field, not filler, and not an invite, so it never breaks Business Fact Rule 6, Output Rule 6, or Sounds Human Rule 5. Ex: "Good evening, yessir we're open Saturday from 10AM to 5PM. We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." follows every rule.
    -The response breaks a sale rule when:
    1. `message_history` is empty and the response never mentions the anniversary sale.
    2. The response mentions the sale more than once, or brings it up after the first message when the customer did not ask about it, unless they asked how long the shop has been around and no agent response in `message_history` mentioned the sale yet.
    3. The sale line asks a question, gives a price, invites them to swing by, makes up an end date, or says a service other than tint, full wraps, clear PPF, or ceramic coating is on the sale.
"""


# BOOKING ENFORCER
#goes right before the checker's #Answer
def booking_enforce_section() -> str:
    return """
    #1 Year In Houston Anniversary Sale
    -The shop is running its 1 year in Houston anniversary sale on tint, full wraps, clear PPF, and ceramic coating for a limited time. Calling a price the shop already quoted the anniversary sale price or the special price, or answering the customer's question about the sale, is not offering a discount and never breaks Service Rule 3. A "(normally X$)" in `message_history` is the normal price shown next to a sale price, never the price that was quoted. A made up end date for the sale breaks Service Rule 2.
"""


# ON THE FENCE
#sales tactic 5, the on the fence generator and its regen both read it
def on_the_fence_sales_tactic() -> str:
    return """    5. Anniversary sale: ONLY when the job they are on the fence about for themselves is window tint, the 1-step ceramic coating, a full vinyl wrap, or a clear PPF full frontal or whole body package, you may use the shop's 1 year in Houston anniversary sale as one of your two selling points. Remind them the sale is only running for a limited time, and when the shop already gave that job's price as the anniversary sale price or the special price in message_history, that the price is the sale price. The limited time is allowed urgency, like the tint special. Never a new price, never a normally price the shop did not already give, and never an end date.
"""


#goes right before the on the fence checker's #Answer
def on_the_fence_enforce_section() -> str:
    return """
    #1 Year In Houston Anniversary Sale
    -The shop is running its 1 year in Houston anniversary sale on window tint, the 1-step ceramic coating, full vinyl wraps, and the clear PPF full frontal and whole body packages for a limited time. When the customer is on the fence for themselves about one of those, reminding them of the sale, that it is only running for a limited time, or that the price the shop already gave as a sale or special price is the sale price, is a fine sales tactic. It counts as one of the two selling points and overrides Closing Rules 1, 2, and 8 for those services.
    -The response still breaks a rule when it uses the sale for any other service or for a customer deciding for someone else, makes up an end date, or gives a new price.
"""


# PHONE CALL
#goes after the phone generator's examples
def phone_section() -> str:
    return r"""
    #1 Year In Houston Anniversary Sale (THIS SECTION OVERRIDES THE EXAMPLES ABOVE)
    -The examples above were written before the sale.
    -When message_history is empty, ALWAYS end the reply with ONE short line about the sale, like "We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." It has no price and no question, and it is the only exception to Hard Rules 4 and 5. Never mention the sale when message_history is non empty, unless the customer asks about it.

    Sale Ex 1:
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 01:15 PM","current_user_message":{"user_media":{},"user_text":"Is there a number I can call? Easier to just talk it through"},"message_history":{}}
    Response: "Good afternoon, for sure you can call or text us at (737) 203-6990. We just hit 1 year in Houston too, so we're running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now."
"""


# SERVICES REQUIRING HUMANS
#goes after the custom job generator's examples
def custom_job_section() -> str:
    return r"""
    #1 Year In Houston Anniversary Sale (THIS SECTION OVERRIDES THE EXAMPLES ABOVE)
    -The examples above were written before the sale.
    -When message_history is empty, add ONE short line about the sale right BEFORE the picture question, so the picture question still ends the reply, like "We just hit 1 year in Houston so we're also running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now." It does not count toward Output Rules 9. The custom job they asked about is NOT on the sale, so never say it is and never give a price. Never mention the sale when message_history is non empty, unless the customer asks about it.

    Sale Ex 1:
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 01:15 PM","current_user_message":{"user_media":{},"user_text":"Can yall do a chrome delete on a 2022 tahoe? window trim and the grille"},"message_history":{}}
    Response: "Good afternoon, yessir we can do a chrome delete on the Tahoe. We just hit 1 year in Houston so we're also running an anniversary sale on tint, full wraps, clear PPF, and ceramic coating right now.

    Price on the chrome depends on how much is on there, so could you send me some pictures of the window trim and grille you want blacked out?"
"""


# FOLLOW UP
#goes after the follow up generator's examples
def followup_section() -> str:
    return r"""
    #1 Year In Houston Anniversary Sale
    -The shop just hit 1 year in Houston and is running an anniversary sale for a limited time on ONLY window tint, the 1-step ceramic coating, full vinyl wraps, and the clear PPF full frontal and whole body packages. It is the ONE deal you may bring up that is not in message_history, so Hard Rule 1 does not apply to it.
    1. First find the service the conversation was about. If it is anything else, like colored PPF, windshield PPF, caliper wraps, a starlight headliner, or a custom job, NEVER mention the sale.
    2. If it is window tint, ceramic coating, a full vinyl wrap, or clear PPF, or no service was settled yet, work the sale into ONE follow up only: this one, when no follow up at the end of the last agent response mentioned the sale yet.
    3. Keep it to a few words inside the usual follow up. Never say to "lock it in", never a new price, never a normally price the shop did not already give, and never an end date.

    ##Anniversary Sale Examples
    Sale Ex 1:
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 08:00 AM","followup_number":1,"message_history":{"user_message_0":{"user_media":{},"user_text":"how much for a purple wrap on my accord"},"agent_response_to_user_message_0":"For the full purple vinyl wrap on your Accord it runs 3000$, and that includes the free ceramic coating and our 5 year warranty.\n\nWant to get on the schedule for this?"}}
    Response: Just checking in on the wrap for your Accord, our 1 year in Houston anniversary sale is still going, want to get you on the schedule?

    Sale Ex 2:
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 08:00 AM","followup_number":1,"message_history":{"user_message_0":{"user_media":{},"user_text":"how much to ceramic coat my 2021 camry"},"agent_response_to_user_message_0":"For your Camry our paint correction/ceramic coating package runs 499$, which is our special price with the 1 year in Houston anniversary sale, and it leaves your paint with that showroom shine.\n\nWant to get on the books for this?"}}
    Response: Just checking in on the ceramic coating for your Camry, our 1 year in Houston anniversary sale is still going, want to get you on the schedule?

    Sale Ex 3:
    STATE: {"current_date_time":"Saturday, October 10, 2026 at 08:00 AM","followup_number":1,"message_history":{"user_message_0":{"user_media":{},"user_text":"how much for colored ppf on my 2021 porsche 718"},"agent_response_to_user_message_0":"For your 718 our colored PPF is applied to the entire vehicle and runs 6500$, and it comes with a free ceramic coating and our 10 year warranty.\n\nWant to get on the schedule for it ?"}}
    Response: Just checking in on the colored PPF for your 718, want to get you on the schedule?
    REASON: Colored PPF is not on the sale, so the follow up never mentions it.
"""


# CONVERSATION SUMMARY
#added to the end of the summary prompt, so a folded conversation still shows the sale came up and keeps its prices as quoted
def summary_note() -> str:
    return """Also keep whether the shop already told them about the 1 year in Houston anniversary sale, and write any sale price with the (normally X$) next to it exactly like the shop did.
"""


# QUOTED AMOUNTS
#the house amount, the comma grouped form is tried first so 3,500 is not read as 3
AMOUNT: str = r"\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?"

#a normal price shown next to a sale price, "(normally 3500$)", "normally runs $3,500", "the usual 3500$", or the spanish "normalmente 3500$"
#the dollar sign is required and only a few joining words are allowed, so "usually go with the 450$" is never cut
NORMAL_PRICE_RE: re.Pattern = re.compile(rf"\(?\b(?:normally|originally|regularly|the\s+usual|normalmente)(?:\s+(?:runs?|goes\s+for|priced\s+at|at|is|was|de|cuesta))?\s+(?:\$\s?(?:{AMOUNT})|(?:{AMOUNT})\s?\$)\)?", re.IGNORECASE)


#the reply without its normal prices, they were never quoted so the booking site never gets them as amounts
def without_normal_prices(text: str) -> str:
    return NORMAL_PRICE_RE.sub("", text or "")
