import { as_strings, pipeline, redis, type Command } from "./redis.js";
import { fields_of, parse_json } from "./shop.js";


//CONSTANTS
//convo members ("channel|userId") that have a confirmed booking, read by the messages Booked view
export const BOOKED: string = "dash:booked";

//keep in step with QUOTE_REF_PATTERN in the booking websites api/_lib/store.ts
const REF_PATTERN: RegExp = /^(facebook|instagram|blooio)\|.{1,64}$/;

//chat apps glue punctuation onto the end of the link
const REF_TRAILING_JUNK: RegExp = /[/.,!?)\s]+$/;

const NOT_DIGIT: RegExp = /\D/g;


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


//MEMBERS OF
//a booking points back at its convo by the ?ref= on the link, or by the phone typed in the form
function members_of(booking: Record<string, unknown>): string[] {
    const members: string[] = [];

    if(typeof booking.ref === "string") {
        const ref: string = booking.ref.replace(REF_TRAILING_JUNK, "");

        if(REF_PATTERN.test(ref)) {
            members.push(ref);
        }
    }

    const phone: string | null = phone_member(booking.phone);

    if(phone !== null) {
        members.push(phone);
    }

    return members;
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


//SYNC BOOKED
//confirmed adds the convo, cancelled takes it back out, an expired booking leaves it booked for good
async function sync_booked(): Promise<void> {
    //once a minute at most since this reads every booking
    const claimed: unknown = await redis(["SET", "dash:booked:sync", 1, "NX", "EX", 60]);

    if(claimed !== "OK") {
        return;
    }

    const confirmed: Set<string> = new Set();

    const cancelled: Set<string> = new Set();

    for(const record of await read_bookings()) {
        const booking: Record<string, unknown> = fields_of(parse_json(record));

        for(const member of members_of(booking)) {
            if(booking.status === "confirmed") {
                confirmed.add(member);
            } else if(booking.status === "cancelled") {
                cancelled.add(member);
            }
        }
    }

    const commands: Command[] = [];

    for(const member of confirmed) {
        commands.push(["SADD", BOOKED, member]);
    }

    //someone who cancelled one and still has another stays booked
    for(const member of cancelled) {
        if(!confirmed.has(member)) {
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
