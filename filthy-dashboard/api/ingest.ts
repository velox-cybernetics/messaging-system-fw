import { fail, json, read_body, server_error } from "./_lib/http.js";
import { as_number, as_strings, pipeline, redis, type Command } from "./_lib/redis.js";
import { refuse_bot } from "./_lib/session.js";
import { CHANNELS, DAY_SET_SECONDS, event_commands, fields_of, follow_up_commands, follow_up_number, is_channel, is_follow_up, MAX_TEXT_CHARS, owner_original, parse_json, parse_rows, preview_text, row_commands, shop_clock, text_of, two_digits, type Channel, type Clock, type Role, type Row, type RowMedia, type ThreadEvent } from "./_lib/shop.js";


//CONSTANTS
const MAX_CONVERSATIONS: number = 200;

//the day charts per hour sets only need today
const HOUR_SET_SECONDS: number = 2 * 24 * 60 * 60;

//enough thread to catch the owners copy of a reply and to count a run of follow ups
const RECENT_ROWS: number = 20;

const MAX_MEDIA: number = 10;

const MAX_DESCRIPTION_CHARS: number = 500;


//TYPES
type Incoming = { body: Record<string, unknown>, event: string, channel: Channel, id: string, member: string, conv_key: string, text: string, now: number, clock: Clock, stats_key: string };


//KEPT URL
//only urls in the private blob store are kept, the one kind /api/media serves back
function kept_url(value: unknown): string {
    try {
        const parsed: URL = new URL(text_of(value));

        if(parsed.protocol === "https:" && parsed.hostname.endsWith(".private.blob.vercel-storage.com")) {
            return parsed.href;
        }

        return "";
    } catch(error: unknown) {
        return "";
    }
}


//CLEAN MEDIA
function clean_media(media: unknown): RowMedia[] {
    const kept: RowMedia[] = [];

    if(!Array.isArray(media)) {
        return kept;
    }

    const items: unknown[] = media.slice(0, MAX_MEDIA);

    for(const item of items) {
        if(item === null || typeof item !== "object") {
            continue;
        }

        const fields: Record<string, unknown> = item as Record<string, unknown>;

        let type: "image" | "video" = "image";

        if(fields.type === "video") {
            type = "video";
        }

        const url: string = kept_url(fields.url);

        const description: string = text_of(fields.description);

        kept.push({ type: type, url: url, description: description.slice(0, MAX_DESCRIPTION_CHARS) });
    }

    return kept;
}


//TOKEN COUNT
function token_count(value: unknown): number {
    let number: number = Number(value);

    if(isNaN(number)) {
        number = 0;
    }

    return Math.max(0, Math.trunc(number));
}


//ALREADY LOGGED
//true when api/send.ts already logged this as the owners own follow up
function already_logged(lines: string[], id: string, channel: Channel): boolean {
    for(const line of lines) {
        const sent: Record<string, unknown> = fields_of(parse_json(line));

        if(sent.id === id && sent.channel === channel) {
            return true;
        }
    }

    return false;
}


//RECORD TOKENS
//llm usage per model call, no convo attached so day totals only
async function record_tokens(body: Record<string, unknown>, stats_key: string): Promise<Response> {
    const tokens_in: number = token_count(body.tokensIn);

    const tokens_out: number = token_count(body.tokensOut);

    if(tokens_in === 0 && tokens_out === 0) {
        return fail(400, "Missing tokensIn or tokensOut");
    }

    const commands: Command[] = [];

    if(tokens_in !== 0) {
        commands.push(["HINCRBY", stats_key, "tin", tokens_in]);
    }

    if(tokens_out !== 0) {
        commands.push(["HINCRBY", stats_key, "tout", tokens_out]);
    }

    await pipeline(commands);

    return json({ ok: true }, 200);
}


//RESTRICTION
//the bot handing a customer to the owner, or a new website quote switching them back on, only counted when the switch moved
async function restriction(id: string, restrict: boolean, now: number, stats_key: string): Promise<Response> {
    let switch_command: Command = ["SREM", "dash:restricted", id];

    if(restrict) {
        switch_command = ["SADD", "dash:restricted", id];
    }

    const moved: number = as_number(await redis(switch_command));

    if(moved === 0) {
        return json({ ok: true }, 200);
    }

    //the event doesnt say which channel, so every convo the id has gets the entry
    const members: string[] = [];

    for(const channel of CHANNELS) {
        members.push(channel + "|" + id);
    }

    const score_command: Command = ["ZMSCORE", "dash:convs"];

    for(const member of members) {
        score_command.push(member);
    }

    const scores: unknown = await redis(score_command);

    let event: ThreadEvent = { at: now, kind: "switch", on: true, by: "quote" };

    if(restrict) {
        event = { at: now, kind: "hil" };
    }

    const commands: Command[] = [];

    if(restrict) {
        commands.push(["HINCRBY", stats_key, "hil", 1]);
    }

    for(let index: number = 0; index < members.length; index++) {
        if(Array.isArray(scores) && scores[index] !== null && scores[index] !== undefined) {
            for(const command of event_commands(members[index] as string, event)) {
                commands.push(command);
            }
        }
    }

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ ok: true }, 200);
}


//RECORD QUOTE
//the booking website reads the last quoted price back off the convo hash when the customer books
async function record_quote(incoming: Incoming): Promise<Response> {
    if(!incoming.body.text) {
        return fail(400, "Missing text");
    }

    let incoming_ms: number = Number(incoming.body.ts);

    if(isNaN(incoming_ms) || incoming_ms === 0) {
        incoming_ms = incoming.now;
    }

    //retries and the boot backfill can deliver quotes out of order, an older one never overwrites a newer one
    const stored_ms: number = as_number(await redis(["HGET", incoming.conv_key, "quotedMs"]));

    if(incoming_ms < stored_ms) {
        return json({ ok: true, skipped: "stale" }, 200);
    }

    let amounts: unknown = [];

    if(Array.isArray(incoming.body.amounts)) {
        amounts = incoming.body.amounts;
    }

    await redis(["HSET", incoming.conv_key, "quotedText", incoming.text, "quotedAmounts", JSON.stringify(amounts), "quotedMs", incoming_ms]);

    return json({ ok: true }, 200);
}


//RECORD TRANSCRIPT
//a mirrored message only goes on the thread, the in events already bumped the counters
async function record_transcript(incoming: Incoming): Promise<Response> {
    const body: Record<string, unknown> = incoming.body;

    const member: string = incoming.member;

    const now: number = incoming.now;

    let role: Role = "customer";

    if(body.role === "agent") {
        role = "agent";
    } else if(body.role === "owner") {
        role = "owner";
    }

    let media: RowMedia[] = [];

    if(role === "customer") {
        media = clean_media(body.media);
    }

    if(!body.text && media.length === 0) {
        return fail(400, "Missing text or media");
    }

    const preview: string = preview_text(role, incoming.text);

    const commands: Command[] = [];

    if(role === "customer") {
        //came in while the system was off for them or their channel, so it went unanswered
        const answers: unknown[] = await pipeline([["SISMEMBER", "dash:restricted", incoming.id], ["SISMEMBER", "dash:off_channels", incoming.channel]]);

        let off: boolean = false;

        if(as_number(answers[0]) === 1 || as_number(answers[1]) === 1) {
            off = true;
        }

        const row: Row = { role: role, text: incoming.text, ts: now, media: media, off: off };

        for(const command of row_commands(member, row)) {
            commands.push(command);
        }

        commands.push(["HSET", incoming.conv_key, "preview", preview]);
    } else {
        const answers: unknown[] = await pipeline([["LRANGE", "dash:msgs:" + member, -RECENT_ROWS, -1], ["HMGET", incoming.conv_key, "lastDir", "lastMs"]]);

        const rows: Row[] = parse_rows(answers[0]);

        if(role === "agent" && owner_original(rows, incoming.text, now) !== null) {
            return json({ ok: true, deduped: true }, 200);
        }

        const row: Row = { role: role, text: incoming.text, ts: now, media: [], off: false };

        for(const command of row_commands(member, row)) {
            commands.push(command);
        }

        //owner typed it by hand, that moves the convo to the top but never touches the counters
        if(role === "owner") {
            if(is_follow_up(answers[1], now)) {
                commands.push(["HINCRBY", incoming.stats_key, "fu", 1]);

                for(const command of follow_up_commands(incoming.channel, incoming.id, follow_up_number(rows), now)) {
                    commands.push(command);
                }
            }

            commands.push(["ZADD", "dash:convs", now, member]);

            commands.push(["HSET", incoming.conv_key, "userId", incoming.id, "channel", incoming.channel, "lastDir", "out", "lastMs", now, "preview", preview]);
        } else {
            commands.push(["HSET", incoming.conv_key, "preview", preview]);
        }
    }

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ ok: true }, 200);
}


//RECORD MESSAGE
//an in or out bumps the days counters and moves the convo to the top of its tab
async function record_message(incoming: Incoming): Promise<Response> {
    const body: Record<string, unknown> = incoming.body;

    const event: string = incoming.event;

    const member: string = incoming.member;

    const now: number = incoming.now;

    const stats_key: string = incoming.stats_key;

    let rows: Row[] = [];

    let follow_up: boolean = false;

    if(event === "out") {
        const answers: unknown[] = await pipeline([["LRANGE", "dash:msgs:" + member, -RECENT_ROWS, -1], ["HMGET", incoming.conv_key, "lastDir", "lastMs"]]);

        rows = parse_rows(answers[0]);

        //a composer sends own report never counts again since api/send.ts just stamped lastMs
        follow_up = is_follow_up(answers[1], now);
    }

    //the owners copy still counts, the message really went out, only its second copy on the thread is skipped
    let original: Row | null = null;

    if(event === "out" && incoming.text !== "") {
        original = owner_original(rows, incoming.text, now);
    }

    //a follow up has its own count so it stays out of the replies
    let counted: boolean = !follow_up;

    if(original !== null) {
        const logged: string[] = as_strings(await redis(["ZRANGEBYSCORE", "dash:followups:sent", original.ts, original.ts]));

        counted = !already_logged(logged, incoming.id, incoming.channel);
    }

    const hour: string = two_digits(incoming.clock.hour);

    const commands: Command[] = [];

    //who messaged in and who got a reply each day and each hour, for the distinct counts
    if(counted) {
        let day_key: string = "dash:uniq:out:" + incoming.clock.date;

        if(event === "in") {
            day_key = "dash:uniq:" + incoming.clock.date;
        }

        const hour_key: string = "dash:uniq:hours:" + incoming.clock.date;

        commands.push(["HINCRBY", stats_key, event, 1]);

        commands.push(["HINCRBY", stats_key, event + "@" + hour, 1]);

        commands.push(["SADD", day_key, member]);

        commands.push(["EXPIRE", day_key, DAY_SET_SECONDS]);

        commands.push(["SADD", hour_key, event + "@" + hour + "|" + member]);

        commands.push(["EXPIRE", hour_key, HOUR_SET_SECONDS]);
    }

    const conv_command: Command = ["HSET", incoming.conv_key, "userId", incoming.id, "channel", incoming.channel, "lastDir", event, "lastMs", now];

    //only a resolved name gets written so a later event without one never blanks a stored name
    if(body.username) {
        conv_command.push("username", String(body.username));
    }

    if(event === "out" && body.link) {
        commands.push(["HINCRBY", stats_key, "links", 1]);

        commands.push(["HINCRBY", stats_key, "links@" + hour, 1]);
    }

    if(follow_up) {
        commands.push(["HINCRBY", stats_key, "fu", 1]);

        for(const command of follow_up_commands(incoming.channel, incoming.id, follow_up_number(rows), now)) {
            commands.push(command);
        }
    }

    if(event === "out" && incoming.text !== "" && original === null) {
        const row: Row = { role: "agent", text: incoming.text, ts: now, media: [], off: false };

        for(const command of row_commands(member, row)) {
            commands.push(command);
        }

        conv_command.push("preview", preview_text("agent", incoming.text));
    }

    commands.push(["ZADD", "dash:convs", now, member]);

    commands.push(conv_command);

    commands.push(["ZREMRANGEBYRANK", "dash:convs", 0, -(MAX_CONVERSATIONS + 1)]);

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ ok: true }, 200);
}


//INGEST
//the bot treats a 4xx as final and retries anything else, so a bad event always answers 400
async function ingest(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    const body: Record<string, unknown> | null = await read_body(request);

    if(body === null) {
        return fail(400, "Invalid JSON body");
    }

    if(!body.event) {
        return fail(400, "Missing event");
    }

    const now: number = Date.now();

    const clock: Clock = shop_clock(now);

    const stats_key: string = "dash:stats:" + clock.date;

    if(body.event === "tokens") {
        return await record_tokens(body, stats_key);
    }

    if(!body.userId) {
        return fail(400, "Missing userId");
    }

    const id: string = String(body.userId);

    if(body.event === "restrict" || body.event === "unrestrict") {
        return await restriction(id, body.event === "restrict", now, stats_key);
    }

    if(body.event !== "in" && body.event !== "out" && body.event !== "transcript" && body.event !== "quote") {
        return fail(400, "Unknown event");
    }

    if(!is_channel(body.channel)) {
        return fail(400, "Unknown channel");
    }

    const channel: Channel = body.channel as Channel;

    const member: string = channel + "|" + id;

    const full_text: string = text_of(body.text);

    const incoming: Incoming = { body: body, event: body.event, channel: channel, id: id, member: member, conv_key: "dash:conv:" + member, text: full_text.slice(0, MAX_TEXT_CHARS), now: now, clock: clock, stats_key: stats_key };

    if(incoming.event === "quote") {
        return await record_quote(incoming);
    }

    if(incoming.event === "transcript") {
        return await record_transcript(incoming);
    }

    return await record_message(incoming);
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await ingest(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
