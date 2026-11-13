import { BOOKED, LINKED } from "./_lib/booked.js";
import { fail, json, server_error } from "./_lib/http.js";
import { as_number, as_object, as_strings, pipeline, redis, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { fields_of, is_tab, parse_event, parse_json, parse_rows, summary_of, TAB_CHANNELS, valid_id, without_owner_copies, type Channel, type Row, type Summary, type Tab, type ThreadEvent } from "./_lib/shop.js";


//TYPES
type PicMedia = { kind: "pic", url: string, caption: string };

type OtherMedia = { kind: "video" | "image", caption: string };

type TextPart = { text: string };

type MediaPart = { media: PicMedia | OtherMedia };

type Part = TextPart | MediaPart;

type InEntry = { at: number, kind: "in", parts: Part[], off: boolean };

type OutEntry = { at: number, kind: "out", by: "system" | "owner", parts: Part[] };

type Entry = InEntry | OutEntry | ThreadEvent;

type Place = { member: string, channel: Channel, id: string };


//ENTRY OF
//media first, the way the customer sent it
function entry_of(row: Row): Entry {
    const parts: Part[] = [];

    for(const each of row.media) {
        if(each.type === "image" && each.url !== "") {
            parts.push({ media: { kind: "pic", url: each.url, caption: each.description } });
        } else {
            parts.push({ media: { kind: each.type, caption: each.description } });
        }
    }

    if(row.text !== "") {
        parts.push({ text: row.text });
    }

    if(row.role === "customer") {
        return { at: row.ts, kind: "in", parts: parts, off: row.off };
    }

    let by: "system" | "owner" = "system";

    if(row.role === "owner") {
        by = "owner";
    }

    return { at: row.ts, kind: "out", by: by, parts: parts };
}


//PLACE OF
function place_of(request: Request): Place | null {
    const params: URLSearchParams = new URL(request.url).searchParams;

    const tab: string | null = params.get("tab");

    const id: string | null = params.get("id");

    if(!is_tab(tab) || !valid_id(id)) {
        return null;
    }

    const channel: Channel = TAB_CHANNELS[tab as Tab];

    return { member: channel + "|" + id, channel: channel, id: id as string };
}


//OLDEST FIRST
function oldest_first(first: Entry, second: Entry): number {
    return first.at - second.at;
}


//SHOW THREAD
async function show_thread(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const place: Place | null = place_of(request);

    if(place === null) {
        return fail(400, "That conversation id isn't valid.");
    }

    const member: string = place.member;

    const answers: unknown[] = await pipeline([["HGETALL", "dash:conv:" + member], ["LRANGE", "dash:msgs:" + member, 0, -1], ["LRANGE", "dash:events:" + member, 0, -1], ["SISMEMBER", "dash:restricted", place.id], ["SISMEMBER", "dash:off_channels", place.channel], ["SISMEMBER", "dash:flagged", member], ["SISMEMBER", BOOKED, member], ["HEXISTS", LINKED, member]]);

    const summary: Summary | null = summary_of(member, as_object(answers[0]));

    if(summary === null) {
        return fail(404, "No conversation with that id. It was deleted from the dashboard.");
    }

    const events: ThreadEvent[] = [];

    for(const line of as_strings(answers[2])) {
        const event: ThreadEvent | null = parse_event(line);

        if(event !== null) {
            events.push(event);
        }
    }

    let flagged_at: number = 0;

    for(const event of events) {
        if(event.kind === "flag" && event.at > flagged_at) {
            flagged_at = event.at;
        }
    }

    //messages go in before events so a reply shows ahead of the switch it flipped at the same moment
    const entries: Entry[] = [];

    for(const row of without_owner_copies(parse_rows(answers[1]))) {
        entries.push(entry_of(row));
    }

    for(const event of events) {
        entries.push(event);
    }

    entries.sort(oldest_first);

    const booked: boolean = as_number(answers[6]) === 1;

    //got the link but hasnt booked yet
    const linked: boolean = as_number(answers[7]) === 1 && !booked;

    const convo: Record<string, unknown> = { id: summary.id, tab: summary.tab, channel: summary.channel, name: summary.name, lastAt: summary.lastAt, lastRole: summary.lastRole, lastText: summary.lastText, off: as_number(answers[3]) === 1, tabOff: as_number(answers[4]) === 1, flagged: as_number(answers[5]) === 1, flaggedAt: flagged_at, booked: booked, linked: linked };

    return json({ convo: convo, entries: entries }, 200);
}


//DELETE THREAD
//the overview counts and the customers switch stay, everything else the dashboard kept for the convo goes
async function delete_thread(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const place: Place | null = place_of(request);

    if(place === null) {
        return fail(400, "That conversation id isn't valid.");
    }

    const member: string = place.member;

    const follow_ups: string[] = [];

    for(const line of as_strings(await redis(["ZRANGE", "dash:followups:sent", 0, -1]))) {
        const fields: Record<string, unknown> = fields_of(parse_json(line));

        if(fields.id === place.id && fields.channel === place.channel) {
            follow_ups.push(line);
        }
    }

    const commands: Command[] = [["ZREM", "dash:convs", member], ["DEL", "dash:conv:" + member, "dash:msgs:" + member, "dash:events:" + member], ["SREM", "dash:flagged", member]];

    if(follow_ups.length > 0) {
        const remove_follow_ups: Command = ["ZREM", "dash:followups:sent"];

        for(const line of follow_ups) {
            remove_follow_ups.push(line);
        }

        commands.push(remove_follow_ups);
    }

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ id: place.id, deleted: true }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await show_thread(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}


//DELETE
export async function DELETE(request: Request): Promise<Response> {
    try {
        return await delete_thread(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
