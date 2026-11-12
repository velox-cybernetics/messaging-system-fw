import { error_text, fail, json } from "./_lib/http.js";
import { normalize_phone, send_message } from "./_lib/messaging.js";
import { Booking, claim_reminder, confirmed_bookings_in_window, mark_reminded } from "./_lib/store.js";
import { add_days, business_date, wall_time_to_utc_ms } from "./_lib/time.js";


//CONSTANTS
const BRAND: string = "Filthy Wraps";

const DAY_MS: number = 24 * 60 * 60 * 1000;


//REMINDER TEXT
function reminder_text(booking: Booking): string {
    return `Reminder from ${BRAND}: your ${String(booking.serviceLabel)} appointment is coming up on ${String(booking.dateLabel)} at ${String(booking.timeLabel)}.\n\nReply CANCEL if you need to cancel.`;
}


//SEND REMINDERS
//daily cron in vercel.json, texts confirmed bookings from now to the end of tomorrow once
async function send_reminders(request: Request): Promise<Response> {
    //vercel sends Bearer CRON_SECRET when it is set, no secret means no check
    const secret: string | undefined = process.env.CRON_SECRET;

    if(secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
        return fail(401, "Unauthorized");
    }

    const now: number = Date.now();

    //end of tomorrow is the start of the day after, in shop time
    const window_end: number = wall_time_to_utc_ms(add_days(business_date(now), 2), "00:00");

    let bookings: Booking[] = [];

    try {
        bookings = await confirmed_bookings_in_window(now, window_end);
    } catch(error: unknown) {
        console.error("REMINDERS SCAN ERROR: " + String(error));

        return fail(500, "Storage error");
    }

    let sent: number = 0;

    let skipped: number = 0;

    for(const booking of bookings) {
        if(booking.reminderSentAt) {
            skipped = skipped + 1;

            continue;
        }

        let booked_at: unknown = booking.createdAt;

        if(!booked_at) {
            booked_at = booking.confirmedAt;
        }

        if(!booked_at) {
            booked_at = 0;
        }

        //booked less than a day ahead means there is no day before to remind
        if(wall_time_to_utc_ms(String(booking.date), String(booking.time)) - Number(booked_at) <= DAY_MS) {
            skipped = skipped + 1;

            continue;
        }

        const to_phone: string | null = normalize_phone(booking.phone);

        if(!to_phone) {
            skipped = skipped + 1;

            continue;
        }

        try {
            //a duplicate cron run already has this one
            if(!(await claim_reminder(String(booking.id)))) {
                skipped = skipped + 1;

                continue;
            }

            await send_message(to_phone, reminder_text(booking));

            await mark_reminded(String(booking.id));

            sent = sent + 1;
        } catch(error: unknown) {
            console.error("REMINDER SEND ERROR for " + String(booking.id) + ": " + error_text(error));
        }
    }

    return json({ ok: true, scanned: bookings.length, sent: sent, skipped: skipped }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    return await send_reminders(request);
}
