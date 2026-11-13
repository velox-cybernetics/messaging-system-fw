import { as_number, as_strings, pipeline, redis, type Command } from "./redis.js";
import { fields_of, parse_json, parse_rows, type Row } from "./shop.js";


//CONSTANTS
//convo members ("channel|userId") with a confirmed booking that came from the system, read by the messages Booked view
export const BOOKED: string = "dash:booked";

//convo member to when the system first sent it the booking link, deleting a thread leaves it so the counts stay
export const LINKED: string = "dash:linked";

//keep in step with BOOKING_LINK in src/rage_functions.py
const BOOKING_HOST: string = "filthy-booking-website.vercel.app";

//keep in step with QUOTE_REF_PATTERN in the booking websites api/_lib/store.ts
const REF_PATTERN: RegExp = /^(facebook|instagram|blooio)\|.{1,64}$/;

//chat apps glue punctuation onto the end of the link
const REF_TRAILING_JUNK: RegExp = /[/.,!?)\s]+$/;

const NOT_DIGIT: RegExp = /\D/g;


//TYPES
//convos is every convo the booking points at, from_system is the ones the systems booking link brought it in through
export type JudgedBooking = { id: string, status: string, booking: Record<string, unknown>, convos: string[], from_system: string[] };


//PHONE MEMBER
//same +1XXXXXXXXXX the bot keys text convos by, null when the number is junk
function phone_member(raw: unknown): string | null {
    if(!raw) {
        return null;
    }

    const digits: string = String(raw).replace(NOT_DIGIT, "");

    if(digits.length === 10) {
        return "blooio|+1" + digits;
    }

    if(digits.length === 11 && digits.startsWith("1")) {
        return "blooio|+" + digits;
    }

    if(digits.length > 11) {
        return "blooio|+" + digits;
    }

    return null;
}


//REF MEMBER
//the convo named by ?ref= on the booking link, only the system puts one there, null when there isnt one
function ref_member(booking: Record<string, unknown>): string | null {
    if(typeof booking.ref !== "string") {
        return null;
    }

    const ref: string = booking.ref.replace(REF_TRAILING_JUNK, "");

    if(!REF_PATTERN.test(ref)) {
        return null;
    }

    return ref;
}


//BOOKED AT
//when they booked, one with neither stamp counts as just now
function booked_at(booking: Record<string, unknown>): number {
    let at: number = as_number(booking.createdAt);

    if(at === 0) {
        at = as_number(booking.confirmedAt);
    }

    if(at === 0) {
        at = Date.now();
    }

    return at;
}


//READ BOOKINGS
async function read_bookings(): Promise<unknown[]> {
    const keys: string[] = [];

    let cursor: string = "0";

    while(true) {
        const answer: unknown = await redis(["SCAN", cursor, "MATCH", "booking:*", "COUNT", 200]);

        let next: unknown = "0";

        let batch: unknown = [];

        if(Array.isArray(answer)) {
            next = answer[0];

            batch = answer[1];
        }

        cursor = String(next);

        for(const key of as_strings(batch)) {
            keys.push(key);
        }

        if(cursor === "0") {
            break;
        }
    }

    const get_commands: Command[] = [];

    for(const key of keys) {
        get_commands.push(["GET", key]);
    }

    if(get_commands.length === 0) {
        return [];
    }

    return await pipeline(get_commands);
}


//FIRST LINK IN
//when the shop first sent the booking link in this thread, 0 when it never did
function first_link_in(rows: Row[]): number {
    for(const row of rows) {
        if(row.role !== "customer" && row.text.includes(BOOKING_HOST)) {
            return row.ts;
        }
    }

    return 0;
}


//LINK TIMES
//when each convo first got the booking link, one from before dash:linked existed gets it read off its thread and saved
async function link_times(members: string[]): Promise<Map<string, number>> {
    const times: Map<string, number> = new Map();

    if(members.length === 0) {
        return times;
    }

    const lookup: Command = ["HMGET", LINKED];

    for(const member of members) {
        lookup.push(member);
    }

    const answer: unknown = await redis(lookup);

    let stamps: unknown[] = [];

    if(Array.isArray(answer)) {
        stamps = answer;
    }

    const unstamped: string[] = [];

    for(let index: number = 0; index < members.length; index++) {
        const member: string = members[index] as string;

        const stamp: number = as_number(stamps[index]);

        if(stamp > 0) {
            times.set(member, stamp);
        } else {
            unstamped.push(member);
        }
    }

    if(unstamped.length === 0) {
        return times;
    }

    const thread_commands: Command[] = [];

    for(const member of unstamped) {
        thread_commands.push(["LRANGE", "dash:msgs:" + member, 0, -1]);
    }

    const threads: unknown[] = await pipeline(thread_commands);

    const save_commands: Command[] = [];

    for(let index: number = 0; index < unstamped.length; index++) {
        const member: string = unstamped[index] as string;

        const first: number = first_link_in(parse_rows(threads[index]));

        if(first > 0) {
            times.set(member, first);

            //saved so it survives the thread getting trimmed or deleted
            save_commands.push(["HSETNX", LINKED, member, first]);
        }
    }

    if(save_commands.length > 0) {
        await pipeline(save_commands);
    }

    return times;
}


//JUDGED BOOKINGS
//the ?ref= convo always came through the systems link, the typed phones text convo only when the system sent it the link before they booked
export async function judged_bookings(): Promise<JudgedBooking[]> {
    const bookings: Record<string, unknown>[] = [];

    const phones: string[] = [];

    for(const record of await read_bookings()) {
        const booking: Record<string, unknown> = fields_of(parse_json(record));

        if(!booking.id) {
            continue;
        }

        bookings.push(booking);

        const phone: string | null = phone_member(booking.phone);

        if(phone !== null && !phones.includes(phone)) {
            phones.push(phone);
        }
    }

    const linked: Map<string, number> = await link_times(phones);

    const judged: JudgedBooking[] = [];

    for(const booking of bookings) {
        const convos: string[] = [];

        const from_system: string[] = [];

        const ref: string | null = ref_member(booking);

        if(ref !== null) {
            convos.push(ref);

            from_system.push(ref);
        }

        const phone: string | null = phone_member(booking.phone);

        if(phone !== null && phone !== ref) {
            convos.push(phone);

            const link_ms: number | undefined = linked.get(phone);

            if(link_ms !== undefined && link_ms <= booked_at(booking)) {
                from_system.push(phone);
            }
        }

        judged.push({ id: String(booking.id), status: String(booking.status), booking: booking, convos: convos, from_system: from_system });
    }

    return judged;
}


//SYNC BOOKED
//a confirmed booking from the system books its convos, a cancelled one or one the system never brought in unbooks them
async function sync_booked(): Promise<void> {
    //once a minute at most since this reads every booking
    const claimed: unknown = await redis(["SET", "dash:booked:sync", 1, "NX", "EX", 60]);

    if(claimed !== "OK") {
        return;
    }

    const booked: Set<string> = new Set();

    const unbooked: Set<string> = new Set();

    const pointed_at: Set<string> = new Set();

    for(const each of await judged_bookings()) {
        for(const member of each.convos) {
            pointed_at.add(member);

            if(each.status === "confirmed" && each.from_system.includes(member)) {
                booked.add(member);
            } else if(each.status === "confirmed" || each.status === "cancelled") {
                unbooked.add(member);
            }
        }
    }

    const commands: Command[] = [];

    for(const member of booked) {
        commands.push(["SADD", BOOKED, member]);
    }

    //someone who cancelled one and still has another from the system stays booked
    for(const member of unbooked) {
        if(!booked.has(member)) {
            commands.push(["SREM", BOOKED, member]);
        }
    }

    //an expired booking leaves its convo booked for good, but only a convo the system sent the link to
    const expired: string[] = [];

    for(const member of as_strings(await redis(["SMEMBERS", BOOKED]))) {
        if(!pointed_at.has(member)) {
            expired.push(member);
        }
    }

    const linked: Map<string, number> = await link_times(expired);

    for(const member of expired) {
        if(!linked.has(member)) {
            commands.push(["SREM", BOOKED, member]);
        }
    }

    if(commands.length > 0) {
        await pipeline(commands);
    }
}


//BOOKED MEMBERS
export async function booked_members(): Promise<Set<string>> {
    await sync_booked();

    return new Set(as_strings(await redis(["SMEMBERS", BOOKED])));
}


//LINKED MEMBERS
//every convo the system ever sent the booking link to, booked or not
export async function linked_members(): Promise<Set<string>> {
    return new Set(as_strings(await redis(["HKEYS", LINKED])));
}
