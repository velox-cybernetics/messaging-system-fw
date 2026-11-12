import { fail, json, read_body, server_error } from "./_lib/http.js";
import { as_number, pipeline, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { event_commands, follow_up_commands, follow_up_number, is_follow_up, is_tab, MAX_TEXT_CHARS, parse_rows, preview_text, row_commands, shop_clock, TAB_CHANNELS, valid_id, type Channel, type Row, type Tab } from "./_lib/shop.js";


//SEND REPLY
//the dashboard has no meta or blooio tokens, so the reply waits on dash:outbox for the bot and the system switches off for the customer
async function send_reply(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const body: Record<string, unknown> | null = await read_body(request);

    let text: string = "";

    if(body !== null && typeof body.text === "string") {
        const trimmed: string = body.text.trim();

        text = trimmed.slice(0, MAX_TEXT_CHARS);
    }

    if(body === null || !is_tab(body.tab) || !valid_id(body.id)) {
        return fail(400, "That conversation id isn't valid.");
    }

    if(text === "") {
        return fail(400, "Write the reply first.");
    }

    const channel: Channel = TAB_CHANNELS[body.tab as Tab];

    const id: string = body.id as string;

    const member: string = channel + "|" + id;

    const conv_key: string = "dash:conv:" + member;

    const now: number = Date.now();

    const day: string = shop_clock(now).date;

    const answers: unknown[] = await pipeline([["HMGET", conv_key, "lastDir", "lastMs"], ["LRANGE", "dash:msgs:" + member, -20, -1], ["SISMEMBER", "dash:restricted", id]]);

    const commands: Command[] = [];

    if(is_follow_up(answers[0], now)) {
        const recent: Row[] = parse_rows(answers[1]);

        commands.push(["HINCRBY", "dash:stats:" + day, "fu", 1]);

        for(const command of follow_up_commands(channel, id, follow_up_number(recent), now)) {
            commands.push(command);
        }
    }

    commands.push(["RPUSH", "dash:outbox", JSON.stringify({ channel: channel, userId: id, text: text, ts: now })]);

    const owner_row: Row = { role: "owner", text: text, ts: now, media: [], off: false };

    for(const command of row_commands(member, owner_row)) {
        commands.push(command);
    }

    commands.push(["ZADD", "dash:convs", now, member]);

    commands.push(["HSET", conv_key, "userId", id, "channel", channel, "lastDir", "out", "lastMs", now, "preview", preview_text("owner", text)]);

    commands.push(["SADD", "dash:restricted", id]);

    //only a switch that actually moved goes on the thread
    if(as_number(answers[2]) === 0) {
        for(const command of event_commands(member, { at: now, kind: "switch", on: false, by: "reply" })) {
            commands.push(command);
        }
    }

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ ok: true, restricted: true }, 200);
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await send_reply(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
