import { fail, json, read_body, server_error } from "./_lib/http.js";
import { as_object, pipeline, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { event_commands, is_tab, parse_rows, TAB_CHANNELS, valid_id, type Channel, type Row, type Tab } from "./_lib/shop.js";


//CONSTANTS
const FEEDBACK_MAX: number = 1000;


//FROM END
//like list.at(-back), "" when the list is too short
function from_end(list: string[], back: number): string {
    const index: number = list.length - back;

    if(index < 0) {
        return "";
    }

    return list[index] as string;
}


//ROW TEXT
//what the models saw, a pics description stands in for the pic
function row_text(row: Row): string {
    const pieces: string[] = [];

    if(row.text !== "") {
        pieces.push(row.text);
    }

    for(const each of row.media) {
        if(each.description !== "") {
            pieces.push("[media: " + each.description + "]");
        }
    }

    return pieces.join("\n");
}


//FLAG CONVO
//the report waits in dash:flags:pending until the bot saves it to its own database through api/flags.ts
async function flag_convo(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const body: Record<string, unknown> | null = await read_body(request);

    let feedback: string = "";

    if(body !== null && typeof body.feedback === "string") {
        feedback = body.feedback.trim();
    }

    if(body === null || !is_tab(body.tab) || !valid_id(body.id) || feedback === "") {
        return fail(400, "Write what went wrong before sending the flag.");
    }

    if(feedback.length > FEEDBACK_MAX) {
        return fail(400, "Keep it under " + String(FEEDBACK_MAX) + " characters.");
    }

    const channel: Channel = TAB_CHANNELS[body.tab as Tab];

    const id: string = body.id as string;

    const member: string = channel + "|" + id;

    const answers: unknown[] = await pipeline([["LRANGE", "dash:msgs:" + member, 0, -1], ["HGETALL", "dash:conv:" + member]]);

    const conv: Record<string, string> = as_object(answers[1]);

    if(Object.keys(conv).length === 0) {
        return fail(404, "No conversation with that id.");
    }

    //hand typed owner replies arent part of the report
    const customer: string[] = [];

    const system: string[] = [];

    for(const row of parse_rows(answers[0])) {
        const text: string = row_text(row);

        if(text === "" || row.role === "owner") {
            continue;
        }

        if(row.role === "agent") {
            system.push(text);
        } else {
            customer.push(text);
        }
    }

    const at: number = Date.now();

    const random_number: number = Math.random();

    const random_text: string = random_number.toString(36);

    const report_id: string = "flag_" + at.toString(36) + random_text.slice(2, 8);

    let username: string | undefined = conv.username;

    if(username === undefined) {
        username = "";
    }

    const report: Record<string, unknown> = { id: report_id, flaggedAt: at, channel: channel, userId: id, username: username, reason: feedback, prevCustomerMsg: from_end(customer, 2), currentCustomerMsg: from_end(customer, 1), prevAgentMsg: from_end(system, 2), currentAgentMsg: from_end(system, 1) };

    const commands: Command[] = [["HSET", "dash:flags:pending", report_id, JSON.stringify(report)], ["SADD", "dash:flagged", member]];

    for(const command of event_commands(member, { at: at, kind: "flag", feedback: feedback })) {
        commands.push(command);
    }

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ ok: true, id: report_id, flaggedAt: at }, 200);
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await flag_convo(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
