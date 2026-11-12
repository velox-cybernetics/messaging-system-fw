import { fail, json, read_body, server_error } from "./_lib/http.js";
import { as_object, pipeline, redis, type Command } from "./_lib/redis.js";
import { refuse_bot } from "./_lib/session.js";
import { fields_of, parse_json } from "./_lib/shop.js";


//FLAGGED AT
function flagged_at(report: unknown): number {
    let value: unknown = fields_of(report).flaggedAt;

    if(value === undefined || value === null) {
        value = 0;
    }

    return Number(value);
}


//OLDEST FIRST
function oldest_first(first: unknown, second: unknown): number {
    return flagged_at(first) - flagged_at(second);
}


//PENDING FLAGS
//bot asks every minute (FLAG_POLL_SECONDS in helpers/dashboard_sync.py) so each ask is also its check in for the overview
async function pending_flags(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    const answers: unknown[] = await pipeline([["HGETALL", "dash:flags:pending"], ["SET", "dash:up_last", Date.now()]]);

    const pending: Record<string, string> = as_object(answers[0]);

    const flags: unknown[] = [];

    for(const id of Object.keys(pending)) {
        const report: unknown = parse_json(pending[id]);

        if(report !== null) {
            flags.push(report);
        }
    }

    flags.sort(oldest_first);

    return json({ flags: flags }, 200);
}


//ACK FLAGS
//fetch and ack are separate so a crash in between only delivers a report again, never loses it
async function ack_flags(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    const body: Record<string, unknown> | null = await read_body(request);

    const ids: string[] = [];

    if(body !== null && Array.isArray(body.ack)) {
        for(const id of body.ack as unknown[]) {
            ids.push(String(id));
        }
    }

    if(ids.length === 0) {
        return fail(400, "Missing ack ids");
    }

    const command: Command = ["HDEL", "dash:flags:pending"];

    for(const id of ids) {
        command.push(id);
    }

    await redis(command);

    return json({ ok: true }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await pending_flags(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await ack_flags(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
