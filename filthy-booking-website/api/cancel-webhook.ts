import { createHmac, timingSafeEqual } from "node:crypto";
import { delete_booking_event } from "./_lib/calendar.js";
import { error_text, fail, json } from "./_lib/http.js";
import { normalize_phone, send_message } from "./_lib/messaging.js";
import { Booking, bookings_for_phone, cancel_booking, release } from "./_lib/store.js";
import { wall_time_to_utc_ms } from "./_lib/time.js";


//CONSTANTS
const BRAND: string = "Filthy Wraps";

const CANCEL_PATTERN: RegExp = /\bcancel\b/i;

//textbelt says refuse signatures older than 15 min
const MAX_SIGNATURE_AGE_SECONDS: number = 15 * 60;


//VERIFY SIGNATURE
//textbelt signs hex hmac-sha256 of timestamp + raw body with TEXTBELT_API_KEY
function verify_signature(raw_body: Buffer, request: Request): boolean {
    const key: string | undefined = process.env.TEXTBELT_API_KEY;

    if(!key) {
        console.error("CANCEL WEBHOOK: TEXTBELT_API_KEY not set, can't verify replies");

        return false;
    }

    const timestamp: string | null = request.headers.get("x-textbelt-timestamp");

    const signature: string | null = request.headers.get("x-textbelt-signature");

    if(timestamp === null || signature === null) {
        console.warn("CANCEL WEBHOOK: missing Textbelt signature headers");

        return false;
    }

    const age_seconds: number = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));

    if(!Number.isFinite(age_seconds) || age_seconds > MAX_SIGNATURE_AGE_SECONDS) {
        console.warn("CANCEL WEBHOOK: signature timestamp out of range " + timestamp);

        return false;
    }

    const expected_hex: string = createHmac("sha256", key).update(timestamp).update(raw_body).digest("hex");

    const expected: Buffer = Buffer.from(expected_hex);

    const given: Buffer = Buffer.from(signature);

    if(expected.length !== given.length) {
        return false;
    }

    return timingSafeEqual(expected, given);
}


//CANCEL CONFIRMATION
function cancel_confirmation(booking: Booking): string {
    return `Your ${BRAND} ${String(booking.serviceLabel)} appointment on ${String(booking.dateLabel)} at ${String(booking.timeLabel)} has been canceled.`;
}


//OWNER NOTICE
function owner_cancel_notice(booking: Booking): string {
    return `${BRAND} cancellation: ${String(booking.serviceLabel)} on ${String(booking.dateLabel)} at ${String(booking.timeLabel)} for ${String(booking.name)} (${String(booking.phone)}).\n\nSlot is now open.`;
}


//APPOINTMENT MS
function appointment_ms(booking: Booking): number {
    return wall_time_to_utc_ms(String(booking.date), String(booking.time));
}


//SOONEST FIRST
function soonest_first(first: Booking, second: Booking): number {
    return appointment_ms(first) - appointment_ms(second);
}


//SEND QUIETLY
async function send_quietly(phone: string, text: string, label: string): Promise<void> {
    try {
        await send_message(phone, text);
    } catch(error: unknown) {
        console.error(label + ": " + error_text(error));
    }
}


//POST
export async function POST(request: Request): Promise<Response> {
    //the signature covers the exact bytes textbelt sent
    const raw_body: Buffer = Buffer.from(await request.arrayBuffer());

    if(!verify_signature(raw_body, request)) {
        return fail(401, "Invalid signature");
    }

    let payload: unknown = null;

    try {
        payload = JSON.parse(raw_body.toString("utf8"));
    } catch(error: unknown) {
        return fail(400, "Invalid JSON");
    }

    //textbelt reply: { textId, fromNumber, text, data? }
    let from_number: unknown = undefined;

    let text: unknown = undefined;

    if(typeof payload === "object" && payload !== null) {
        from_number = (payload as Record<string, unknown>).fromNumber;

        text = (payload as Record<string, unknown>).text;
    }

    if(!from_number || typeof text !== "string") {
        return json({ ok: true, ignored: "no from or text" }, 200);
    }

    if(!CANCEL_PATTERN.test(text)) {
        return json({ ok: true, ignored: "not a cancel keyword" }, 200);
    }

    const from_phone: string | null = normalize_phone(from_number);

    if(!from_phone) {
        return json({ ok: true, ignored: "unparseable sender" }, 200);
    }

    const bookings: Booking[] = await bookings_for_phone(from_phone);

    const now: number = Date.now();

    const upcoming: Booking[] = [];

    for(const booking of bookings) {
        const ms: number = appointment_ms(booking);

        if(booking.status !== "cancelled" && !isNaN(ms) && ms > now) {
            upcoming.push(booking);
        }
    }

    upcoming.sort(soonest_first);

    if(upcoming.length === 0) {
        await send_quietly(from_phone, `We couldn't find an upcoming ${BRAND} booking for this number.`, "NO BOOKING REPLY ERROR");

        return json({ ok: true, canceled: 0 }, 200);
    }

    //only the next one, with more they can reply CANCEL again
    const target: Booking = upcoming[0] as Booking;

    try {
        await release(target.date, target.time, target.location, target.service, target.id);

        await cancel_booking(String(target.id));
    } catch(error: unknown) {
        console.error("CANCEL CLEANUP ERROR: " + String(error));

        return fail(500, "Storage error");
    }

    if(target.calendarEventId) {
        try {
            await delete_booking_event(target.calendarEventId, target.location);
        } catch(error: unknown) {
            console.error("CALENDAR DELETE ERROR: " + error_text(error));
        }
    }

    let owner_phone: string | null = null;

    if(process.env.OWNER_PHONE_NUMBER) {
        owner_phone = normalize_phone(process.env.OWNER_PHONE_NUMBER);
    }

    await send_quietly(from_phone, cancel_confirmation(target), "CANCEL CONFIRMATION ERROR");

    if(owner_phone) {
        await send_quietly(owner_phone, owner_cancel_notice(target), "OWNER CANCEL NOTICE ERROR");
    }

    return json({ ok: true, canceled: 1, bookingId: target.id }, 200);
}
