import { waitUntil } from "@vercel/functions";
import { fire_confirmations } from "./_lib/confirm.js";
import { error_text, fail, json } from "./_lib/http.js";
import { is_known_location, Location, LOCATIONS } from "./_lib/locations.js";
import { DEPOSIT_SERVICES, is_known_service, OTHER_SERVICE, slots_for_date } from "./_lib/rules.js";
import { create_deposit_payment_link, PaymentLink } from "./_lib/square.js";
import { Booking, confirmed_expiry_ms, get_conversation_quote, link_order_to_booking, new_booking_id, occupy, Quote, release, save_confirmed, save_pending, set_calendar_event_id } from "./_lib/store.js";
import { wall_time_to_utc_ms } from "./_lib/time.js";


//CONSTANTS
//deposit bookings hold their slot this long while the customer pays
const HOLD_MS: number = 30 * 60 * 1000;

const CUSTOM_SERVICE_MAX: number = 100;

const REQUIRED_FIELDS: string[] = ["name", "phone", "service", "date", "dateLabel", "time", "timeLabel", "location"];

const MESSY_SPACE_PATTERN: RegExp = /[\s\u0000-\u001f\u007f]+/g;

const TRAILING_SLASHES_PATTERN: RegExp = /\/+$/;


//BASE URL
//where square sends the customer back after paying
function base_url(request: Request): string {
    const booking_url: string | undefined = process.env.BOOKING_URL;

    if(booking_url) {
        return booking_url.replace(TRAILING_SLASHES_PATTERN, "");
    }

    let forwarded_proto: string | null = request.headers.get("x-forwarded-proto");

    if(!forwarded_proto) {
        forwarded_proto = "https";
    }

    const proto: string = forwarded_proto.split(",")[0] as string;

    let host: string | null = request.headers.get("x-forwarded-host");

    if(!host) {
        host = request.headers.get("host");
    }

    return `${proto}://${String(host)}`;
}


//RELEASE QUIETLY
//the hold lapses on its own anyway so a failed release is fine
async function release_quietly(booking: Booking, booking_id: string): Promise<void> {
    try {
        await release(booking.date, booking.time, booking.location, booking.service, booking_id);
    } catch(error: unknown) {
        return;
    }
}


//SEND CONFIRMATIONS
//runs after the response and never throws
async function send_confirmations(saved: Booking): Promise<void> {
    const event_id: unknown = await fire_confirmations(saved);

    if(!event_id) {
        return;
    }

    try {
        await set_calendar_event_id(String(saved.id), event_id);
    } catch(error: unknown) {
        console.error("CALENDAR EVENT ID ERROR: " + String(error));
    }
}


//BOOK
async function book(request: Request): Promise<Response> {
    let body: unknown = null;

    try {
        body = await request.json();
    } catch(error: unknown) {
        return fail(400, "Invalid JSON body");
    }

    let booking: Booking = {};

    if(typeof body === "object" && body !== null && !Array.isArray(body)) {
        booking = body as Booking;
    }

    for(const field of REQUIRED_FIELDS) {
        if(!booking[field]) {
            return fail(400, `Missing field: ${field}`);
        }
    }

    if(!is_known_service(booking.service)) {
        return fail(400, "Unknown service");
    }

    //"Other" carries what the customer typed, it becomes the label in texts, calendar and square
    if(booking.service === OTHER_SERVICE) {
        let custom: string = "";

        if(typeof booking.customService === "string") {
            custom = booking.customService.replace(MESSY_SPACE_PATTERN, " ").trim();
        }

        if(!custom || custom.length > CUSTOM_SERVICE_MAX) {
            return fail(400, `Describe the service (1-${CUSTOM_SERVICE_MAX} characters)`);
        }

        booking.customService = custom;

        booking.serviceLabel = `Other (${custom})`;
    } else {
        delete booking.customService;

        booking.serviceLabel = booking.service;
    }

    if(!is_known_location(booking.location)) {
        return fail(400, "Unknown location");
    }

    //must be a real open slot or a garbage date ends up in a redis key
    const time: unknown = booking.time;

    if(typeof time !== "string" || !slots_for_date(booking.date).includes(time)) {
        return fail(400, "Invalid date or time");
    }

    //label and address come from the server so texts never use what the client typed
    const location: Location = LOCATIONS[String(booking.location)] as Location;

    booking.locationLabel = location.label;

    booking.locationAddress = location.address;

    //the quote comes from redis by ?ref= or phone, never from the client
    if(booking.ref && (typeof booking.ref !== "string" || booking.ref.length > 80)) {
        delete booking.ref;
    }

    const quote: Quote | null = await get_conversation_quote(booking.ref, booking.phone);

    let ref_text: string = "none";

    if(booking.ref) {
        ref_text = String(booking.ref);
    }

    let hit_text: string = "none";

    if(quote !== null) {
        hit_text = quote.quoteSource;
    }

    //one glance in the vercel logs shows if the quote attached
    console.log(`QUOTE LOOKUP: ref=${ref_text} phone=${String(booking.phone)} hit=${hit_text}`);

    if(quote !== null) {
        booking.quotedText = quote.quotedText;

        booking.quotedAmounts = quote.quotedAmounts;

        booking.quotedMs = quote.quotedMs;

        booking.quoteSource = quote.quoteSource;
    }

    const appointment_ms: number = wall_time_to_utc_ms(String(booking.date), String(booking.time));

    if(appointment_ms <= Date.now()) {
        return json({ error: "slot_past", message: "That time has already passed. Please pick another." }, 409);
    }

    const booking_id: string = new_booking_id();

    const is_deposit: boolean = DEPOSIT_SERVICES.includes(String(booking.service));

    //deposit holds last 30 min, everything else is confirmed now and holds until 7 days after
    let expiry_ms: number = 0;

    if(is_deposit) {
        expiry_ms = Date.now() + HOLD_MS;
    } else {
        expiry_ms = confirmed_expiry_ms(booking.date, booking.time);
    }

    let claimed: boolean = false;

    try {
        claimed = await occupy(booking.date, booking.time, booking.location, booking.service, booking_id, expiry_ms);
    } catch(error: unknown) {
        console.error("CAPACITY CLAIM ERROR: " + String(error));

        return fail(500, "Storage error");
    }

    if(!claimed) {
        return json({ error: "slot_taken", message: "That time is no longer available. Please pick another." }, 409);
    }

    booking.id = booking_id;

    //DEPOSIT SERVICES
    if(is_deposit) {
        let pending: Booking = {};

        try {
            pending = await save_pending(booking);
        } catch(error: unknown) {
            console.error("SAVE PENDING ERROR, releasing hold: " + String(error));

            await release_quietly(booking, booking_id);

            return fail(500, "Storage error");
        }

        let link: PaymentLink = { url: undefined, orderId: undefined };

        try {
            const redirect_url: string = `${base_url(request)}/success.html?bk=${encodeURIComponent(booking_id)}`;

            link = await create_deposit_payment_link(pending, redirect_url, `deposit-${booking_id}`);
        } catch(error: unknown) {
            console.error("PAYMENT LINK ERROR, releasing hold: " + error_text(error));

            await release_quietly(booking, booking_id);

            return json({ error: "payment_init_failed", message: "Could not start the deposit payment. Please try again." }, 502);
        }

        try {
            await link_order_to_booking(link.orderId, booking_id);
        } catch(error: unknown) {
            console.error("ORDER LINK ERROR (non-fatal): " + String(error));
        }

        return json({ ok: true, requiresDeposit: true, bookingId: booking_id, checkoutUrl: link.url }, 200);
    }

    //EVERYTHING ELSE
    let saved: Booking = {};

    try {
        saved = await save_confirmed(booking);
    } catch(error: unknown) {
        console.error("SAVE BOOKING ERROR, releasing capacity: " + String(error));

        await release_quietly(booking, booking_id);

        return fail(500, "Storage error");
    }

    //answer now, waitUntil keeps the function alive for the texts and calendar event
    waitUntil(send_confirmations(saved));

    return json({ ok: true, bookingId: booking_id }, 200);
}


//HEAD
//warm up ping from the details step so the submit skips the cold start
export async function HEAD(): Promise<Response> {
    return new Response(null, { status: 204 });
}


//POST
export async function POST(request: Request): Promise<Response> {
    return await book(request);
}
