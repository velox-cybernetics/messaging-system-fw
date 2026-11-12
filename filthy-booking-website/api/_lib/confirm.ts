import { create_booking_event } from "./calendar.js";
import { error_text } from "./http.js";
import { normalize_phone, send_message } from "./messaging.js";


//CONSTANTS
const BRAND: string = "Filthy Wraps";


//CUSTOMER MESSAGE
function customer_message(booking: Record<string, unknown>): string {
    return `Hi ${String(booking.name)}, your ${String(booking.serviceLabel)} booking with ${BRAND} is confirmed for ${String(booking.dateLabel)} at ${String(booking.timeLabel)}.\n\nLocation: ${String(booking.locationAddress)}.\n\nReply CANCEL to cancel this appointment.`;
}


//OWNER MESSAGE
function owner_message(booking: Record<string, unknown>): string {
    return `New ${BRAND} booking:\n${String(booking.serviceLabel)}\n${String(booking.dateLabel)} at ${String(booking.timeLabel)}\nLocation: ${String(booking.locationLabel)}\nName: ${String(booking.name)}\nPhone: ${String(booking.phone)}`;
}


//CALENDAR STEP
//gives back the new event id, or undefined when skipped or failed
async function calendar_step(booking: Record<string, unknown>): Promise<unknown> {
    try {
        const event: unknown = await create_booking_event(booking);

        if(event) {
            return (event as Record<string, unknown>).id;
        }

        return undefined;
    } catch(error: unknown) {
        console.error("CALENDAR EVENT ERROR: " + error_text(error));

        return undefined;
    }
}


//CUSTOMER STEP
async function customer_step(customer_phone: string | null, booking: Record<string, unknown>): Promise<void> {
    if(customer_phone === null) {
        return;
    }

    try {
        await send_message(customer_phone, customer_message(booking));
    } catch(error: unknown) {
        console.error("CUSTOMER SMS ERROR: " + error_text(error));
    }
}


//OWNER STEP
async function owner_step(owner_phone: string | null, booking: Record<string, unknown>): Promise<void> {
    //without this log nobody would ever learn the owner wasnt texted
    if(owner_phone === null) {
        console.warn("CONFIRM: owner SMS skipped, OWNER_PHONE_NUMBER missing or unparseable");

        return;
    }

    try {
        const result: Record<string, unknown> = await send_message(owner_phone, owner_message(booking));

        //accepted isnt delivered, the textId looks it up at textbelt.com/status/<textId>
        console.log("CONFIRM: owner SMS accepted, textId=" + String(result.textId) + " quotaRemaining=" + String(result.quotaRemaining));
    } catch(error: unknown) {
        console.error("OWNER SMS ERROR: " + error_text(error));
    }
}


//FIRE CONFIRMATIONS
//runs once per booking and never throws, a failed text must not fail the booking
export async function fire_confirmations(booking: Record<string, unknown>): Promise<unknown> {
    let owner_phone: string | null = null;

    if(process.env.OWNER_PHONE_NUMBER) {
        owner_phone = normalize_phone(process.env.OWNER_PHONE_NUMBER);
    }

    const customer_phone: string | null = normalize_phone(booking.phone);

    //all three at once so the square webhook answers before square gives up on it
    const results: unknown[] = await Promise.all([calendar_step(booking), customer_step(customer_phone, booking), owner_step(owner_phone, booking)]);

    return results[0];
}
