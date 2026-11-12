import { Pipeline, Redis } from "@upstash/redis";
import { error_text } from "./http.js";
import { normalize_phone } from "./messaging.js";
import { Bucket, buckets_for, slots_for_date } from "./rules.js";
import { wall_time_to_utc_ms } from "./time.js";


//CONFIG
//reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const redis: Redis = Redis.fromEnv();


//CONSTANTS
const SEVEN_DAYS_SECONDS: number = 60 * 60 * 24 * 7;

//a bit longer than the 30 min deposit hold so a slightly late payment webhook still finds the record
const PENDING_SECONDS: number = 35 * 60;

//the bot writes ref as channel|userId, see the dashboard ingest
const QUOTE_REF_PATTERN: RegExp = /^(facebook|instagram|blooio)\|.{1,64}$/;

//chat apps glue punctuation onto the end of the link
const REF_TRAILING_JUNK_PATTERN: RegExp = /[/.,!?)\s]+$/;


//TYPES
export type Booking = Record<string, unknown>;

export type ConfirmResult = { booking: Booking | null, alreadyConfirmed: boolean };

export type Quote = { quotedText: string, quotedAmounts: unknown[], quotedMs: number | null, quoteSource: string };


//BOOKING KEY
function booking_key(booking_id: string): string {
    return `booking:${booking_id}`;
}


//PHONE KEY
function phone_key(phone: unknown): string {
    return `phone:${String(phone)}:bookings`;
}


//ORDER KEY
function order_key(order_id: unknown): string {
    return `sqorder:${String(order_id)}`;
}


//NEW BOOKING ID
export function new_booking_id(): string {
    const random_part: string = Math.random().toString(36).slice(2, 10);

    const time_part: string = Date.now().toString(36).slice(-4);

    return "bk_" + random_part + time_part;
}


//APPOINTMENT MS
//falls back to now when the date or time cant be read
function appointment_ms(date_text: unknown, time_text: unknown): number {
    const ms: number = wall_time_to_utc_ms(String(date_text), String(time_text));

    if(isNaN(ms)) {
        return Date.now();
    }

    return ms;
}


//APPOINTMENT TTL
//seconds until 7 days after the appointment, at least 60
function ttl_for_appointment(date_text: unknown, time_text: unknown): number {
    const seconds: number = Math.floor((appointment_ms(date_text, time_text) + SEVEN_DAYS_SECONDS * 1000 - Date.now()) / 1000);

    return Math.max(60, seconds);
}


//CONFIRMED EXPIRY
//a confirmed booking holds its buckets until 7 days after the appointment
export function confirmed_expiry_ms(date_text: unknown, time_text: unknown): number {
    return appointment_ms(date_text, time_text) + SEVEN_DAYS_SECONDS * 1000;
}


//KEY TTL
//outlive the latest member by a little
function key_ttl_seconds(expiry_ms: number): number {
    return Math.max(60, Math.ceil((expiry_ms - Date.now()) / 1000) + 120);
}


//OCCUPY
//add then count in one atomic MULTI so two people racing for the last spot cant both lose
export async function occupy(date_text: unknown, time_text: unknown, location: unknown, service: unknown, booking_id: string, expiry_ms: number): Promise<boolean> {
    const buckets: Bucket[] = buckets_for(String(date_text), String(time_text), location, String(service));

    if(buckets.length === 0) {
        return true;
    }

    const now: number = Date.now();

    const transaction: Pipeline<[]> = redis.multi();

    for(const bucket of buckets) {
        transaction.zremrangebyscore(bucket.key, 0, now);

        transaction.zadd(bucket.key, { score: expiry_ms, member: booking_id });

        transaction.expire(bucket.key, key_ttl_seconds(expiry_ms));

        transaction.zcount(bucket.key, now, "+inf");
    }

    const results: unknown[] = await transaction.exec();

    let over_cap: boolean = false;

    //four commands per bucket, the fourth is the live count
    for(let index: number = 0; index < buckets.length; index++) {
        const bucket: Bucket = buckets[index] as Bucket;

        if(Number(results[index * 4 + 3]) > bucket.cap) {
            over_cap = true;
        }
    }

    if(over_cap) {
        for(const bucket of buckets) {
            await redis.zrem(bucket.key, booking_id);
        }

        return false;
    }

    return true;
}


//RELEASE
export async function release(date_text: unknown, time_text: unknown, location: unknown, service: unknown, booking_id: unknown): Promise<void> {
    const buckets: Bucket[] = buckets_for(String(date_text), String(time_text), location, String(service));

    for(const bucket of buckets) {
        await redis.zrem(bucket.key, booking_id);
    }
}


//PROMOTE
//XX so a hold that was already released doesnt come back to life
async function promote(date_text: unknown, time_text: unknown, location: unknown, service: unknown, booking_id: string): Promise<void> {
    const buckets: Bucket[] = buckets_for(String(date_text), String(time_text), location, String(service));

    const expiry_ms: number = confirmed_expiry_ms(date_text, time_text);

    for(const bucket of buckets) {
        await redis.zadd(bucket.key, { xx: true }, { score: expiry_ms, member: booking_id });

        await redis.expire(bucket.key, key_ttl_seconds(expiry_ms));
    }
}


//SAVE PENDING
export async function save_pending(booking: Booking): Promise<Booking> {
    booking.status = "pending_payment";

    booking.createdAt = Date.now();

    await redis.set(booking_key(String(booking.id)), JSON.stringify(booking), { ex: PENDING_SECONDS });

    return booking;
}


//SAVE CONFIRMED
export async function save_confirmed(booking: Booking): Promise<Booking> {
    booking.status = "confirmed";

    booking.createdAt = Date.now();

    await redis.set(booking_key(String(booking.id)), JSON.stringify(booking), { ex: ttl_for_appointment(booking.date, booking.time) });

    await redis.sadd(phone_key(booking.phone), booking.id);

    return booking;
}


//GET BOOKING
//a corrupt record counts as missing instead of a 500
async function get_booking(booking_id: string): Promise<Booking | null> {
    const raw: unknown = await redis.get(booking_key(booking_id));

    if(!raw) {
        return null;
    }

    if(typeof raw !== "string") {
        return raw as Booking;
    }

    try {
        return JSON.parse(raw) as Booking;
    } catch(error: unknown) {
        return null;
    }
}


//SET CALENDAR EVENT
//saved so a cancel can delete the event later
export async function set_calendar_event_id(booking_id: string, event_id: unknown): Promise<void> {
    if(!event_id) {
        return;
    }

    const booking: Booking | null = await get_booking(booking_id);

    if(!booking) {
        return;
    }

    booking.calendarEventId = event_id;

    await redis.set(booking_key(booking_id), JSON.stringify(booking), { ex: ttl_for_appointment(booking.date, booking.time) });
}


//CANCEL BOOKING
//soft cancel, the record and phone index stay for history until the normal ttl
export async function cancel_booking(booking_id: string): Promise<Booking | null> {
    const booking: Booking | null = await get_booking(booking_id);

    if(!booking) {
        return null;
    }

    booking.status = "cancelled";

    booking.cancelledAt = Date.now();

    await redis.set(booking_key(booking_id), JSON.stringify(booking), { ex: ttl_for_appointment(booking.date, booking.time) });

    return booking;
}


//BOOKINGS IN WINDOW
//confirmed bookings with the appointment in (from_ms, to_ms], a SCAN is fine since records ttl out
export async function confirmed_bookings_in_window(from_ms: number, to_ms: number): Promise<Booking[]> {
    const found: Booking[] = [];

    let cursor: string = "0";

    let done: boolean = false;

    while(!done) {
        const scan_result: [string, string[]] = await redis.scan(cursor, { match: "booking:*", count: 200 });

        cursor = String(scan_result[0]);

        const keys: string[] = scan_result[1];

        if(keys && keys.length > 0) {
            const raws: unknown[] = [];

            for(const key of keys) {
                raws.push(await redis.get(key));
            }

            for(const raw of raws) {
                const booking: Booking | null = read_scanned_booking(raw);

                if(booking === null || booking.status !== "confirmed") {
                    continue;
                }

                const ms: number = wall_time_to_utc_ms(String(booking.date), String(booking.time));

                if(isNaN(ms) || ms <= from_ms || ms > to_ms) {
                    continue;
                }

                found.push(booking);
            }
        }

        if(cursor === "0") {
            done = true;
        }
    }

    return found;
}


//READ SCANNED BOOKING
//skip a corrupt record instead of failing the whole scan
function read_scanned_booking(raw: unknown): Booking | null {
    if(!raw) {
        return null;
    }

    let value: unknown = raw;

    if(typeof raw === "string") {
        try {
            value = JSON.parse(raw);
        } catch(error: unknown) {
            return null;
        }
    }

    if(typeof value !== "object" || value === null) {
        return null;
    }

    return value as Booking;
}


//MARK REMINDED
export async function mark_reminded(booking_id: string): Promise<Booking | null> {
    const booking: Booking | null = await get_booking(booking_id);

    if(!booking) {
        return null;
    }

    booking.reminderSentAt = Date.now();

    await redis.set(booking_key(booking_id), JSON.stringify(booking), { ex: ttl_for_appointment(booking.date, booking.time) });

    return booking;
}


//CLAIM REMINDER
//vercel can run the same cron twice at once, only the run that sets this key texts
export async function claim_reminder(booking_id: string): Promise<boolean> {
    const claimed: unknown = await redis.set(`reminding:${booking_id}`, "1", { nx: true, ex: 60 * 60 });

    return Boolean(claimed);
}


//BOOKINGS FOR PHONE
export async function bookings_for_phone(phone: string): Promise<Booking[]> {
    const booking_ids: string[] = await redis.smembers(phone_key(phone));

    if(!booking_ids || booking_ids.length === 0) {
        return [];
    }

    const bookings: Booking[] = [];

    for(const booking_id of booking_ids) {
        const booking: Booking | null = await get_booking(booking_id);

        if(booking) {
            bookings.push(booking);
        }
    }

    return bookings;
}


//LINK ORDER
export async function link_order_to_booking(order_id: unknown, booking_id: string): Promise<void> {
    await redis.set(order_key(order_id), booking_id, { ex: PENDING_SECONDS + 600 });
}


//BOOKING FOR ORDER
export async function booking_id_for_order(order_id: unknown): Promise<string | null> {
    const booking_id: unknown = await redis.get(order_key(order_id));

    return booking_id as string | null;
}


//CONFIRM PENDING
//safe against square sending the same webhook twice
export async function confirm_pending_booking(booking_id: string): Promise<ConfirmResult> {
    const booking: Booking | null = await get_booking(booking_id);

    if(!booking) {
        return { booking: null, alreadyConfirmed: false };
    }

    if(booking.status === "confirmed") {
        return { booking: booking, alreadyConfirmed: true };
    }

    const got_lock: unknown = await redis.set(`confirming:${booking_id}`, "1", { nx: true, ex: 120 });

    if(!got_lock) {
        return { booking: booking, alreadyConfirmed: true };
    }

    await promote(booking.date, booking.time, booking.location, booking.service, booking_id);

    booking.status = "confirmed";

    booking.confirmedAt = Date.now();

    await redis.set(booking_key(booking_id), JSON.stringify(booking), { ex: ttl_for_appointment(booking.date, booking.time) });

    await redis.sadd(phone_key(booking.phone), booking_id);

    return { booking: booking, alreadyConfirmed: false };
}


//LIST DATES
function list_dates(start_date: string, end_date: string): string[] {
    const dates: string[] = [];

    const start: Date = new Date(start_date + "T00:00:00Z");

    const end: Date = new Date(end_date + "T00:00:00Z");

    const day: Date = new Date(start.getTime());

    while(day <= end) {
        dates.push(day.toISOString().slice(0, 10));

        day.setUTCDate(day.getUTCDate() + 1);
    }

    return dates;
}


//GET AVAILABILITY
//date -> times that are full or already past, one pipelined round trip of ZCOUNTs
export async function get_availability(location: string, service: string, start_date: string, end_date: string): Promise<Record<string, string[]>> {
    const dates: string[] = list_dates(start_date, end_date);

    if(dates.length === 0) {
        return {};
    }

    const now: number = Date.now();

    const buckets_by_slot: Record<string, Bucket[]> = {};

    const bucket_keys: string[] = [];

    const cap_by_key: Record<string, number> = {};

    for(const date of dates) {
        for(const time of slots_for_date(date)) {
            const buckets: Bucket[] = buckets_for(date, time, location, service);

            buckets_by_slot[date + " " + time] = buckets;

            for(const bucket of buckets) {
                if(!bucket_keys.includes(bucket.key)) {
                    bucket_keys.push(bucket.key);
                }

                cap_by_key[bucket.key] = bucket.cap;
            }
        }
    }

    const count_by_key: Record<string, number> = {};

    if(bucket_keys.length > 0) {
        const pipeline: Pipeline<[]> = redis.pipeline();

        for(const key of bucket_keys) {
            pipeline.zcount(key, now, "+inf");
        }

        const results: unknown[] = await pipeline.exec();

        for(let index: number = 0; index < bucket_keys.length; index++) {
            let count: number = Number(results[index]);

            if(!count) {
                count = 0;
            }

            count_by_key[bucket_keys[index] as string] = count;
        }
    }

    const taken: Record<string, string[]> = {};

    for(const date of dates) {
        const unavailable: string[] = [];

        for(const time of slots_for_date(date)) {
            const buckets: Bucket[] = buckets_by_slot[date + " " + time] as Bucket[];

            let full: boolean = false;

            for(const bucket of buckets) {
                let count: number | undefined = count_by_key[bucket.key];

                if(!count) {
                    count = 0;
                }

                if(count >= bucket.cap) {
                    full = true;
                }
            }

            //a slot that already started isnt bookable
            const past: boolean = appointment_ms(date, time) <= now;

            if(full || past) {
                unavailable.push(time);
            }
        }

        taken[date] = unavailable;
    }

    return taken;
}


//CONVERSATION QUOTE
//the bot freezes the quote onto dash:conv:<channel|userId> when it sends the link, read here so the client cant fake a price
export async function get_conversation_quote(ref: unknown, phone: unknown): Promise<Quote | null> {
    const members: string[] = [];

    let clean_ref: unknown = ref;

    if(typeof clean_ref === "string") {
        clean_ref = clean_ref.replace(REF_TRAILING_JUNK_PATTERN, "");
    }

    if(typeof clean_ref === "string" && QUOTE_REF_PATTERN.test(clean_ref)) {
        members.push(clean_ref);
    }

    if(phone) {
        //the bot keys text conversations by +1XXXXXXXXXX but the form phone comes however it was typed
        const e164: string | null = normalize_phone(phone);

        if(e164) {
            members.push(`blooio|${e164}`);
        }

        if(!e164 || String(phone) !== e164) {
            members.push(`blooio|${String(phone)}`);
        }
    }

    const conversations: unknown[] = [];

    for(const member of members) {
        conversations.push(await read_conversation(member));
    }

    //first hit wins, ref before phone
    for(let index: number = 0; index < members.length; index++) {
        const member: string = members[index] as string;

        const conversation: Record<string, unknown> | null = conversations[index] as Record<string, unknown> | null;

        if(!conversation || !conversation.quotedText) {
            continue;
        }

        let amounts: unknown = conversation.quotedAmounts;

        if(typeof amounts === "string") {
            try {
                amounts = JSON.parse(amounts);
            } catch(error: unknown) {
                amounts = [];
            }
        }

        let quoted_amounts: unknown[] = [];

        if(Array.isArray(amounts)) {
            quoted_amounts = amounts;
        }

        let quoted_ms: number | null = Number(conversation.quotedMs);

        if(!quoted_ms) {
            quoted_ms = null;
        }

        let quote_source: string = "phone";

        if(member === clean_ref) {
            quote_source = "ref";
        }

        return { quotedText: String(conversation.quotedText), quotedAmounts: quoted_amounts, quotedMs: quoted_ms, quoteSource: quote_source };
    }

    return null;
}


//READ CONVERSATION
async function read_conversation(member: string): Promise<unknown> {
    try {
        return await redis.hgetall(`dash:conv:${member}`);
    } catch(error: unknown) {
        console.error("QUOTE LOOKUP ERROR: " + error_text(error));

        return null;
    }
}
