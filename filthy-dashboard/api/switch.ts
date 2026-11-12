import { fail, json, read_body, server_error } from "./_lib/http.js";
import { pipeline, redis, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { event_commands, is_tab, TAB_CHANNELS, valid_id, type Channel, type Tab } from "./_lib/shop.js";


//FLIP SWITCH
//dash:restricted and dash:off_channels are what the bot reads through api/restricted.ts before every answer and send
async function flip_switch(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const body: Record<string, unknown> | null = await read_body(request);

    if(body === null || typeof body.on !== "boolean") {
        return fail(400, "Send on: true or false, with a tab and maybe a conversation id.");
    }

    const on: boolean = body.on;

    if(!is_tab(body.tab)) {
        return fail(400, `Unknown tab "${body.tab}".`);
    }

    const tab: Tab = body.tab as Tab;

    const channel: Channel = TAB_CHANNELS[tab];

    //a whole channel gets no thread entry, each message it leaves unanswered already shows that
    if(body.id === undefined) {
        let channel_command: Command = ["SADD", "dash:off_channels", channel];

        if(on) {
            channel_command = ["SREM", "dash:off_channels", channel];
        }

        await pipeline([channel_command, ["INCR", "dash:version"]]);

        return json({ tab: tab, on: on }, 200);
    }

    if(!valid_id(body.id)) {
        return fail(400, "Send the conversation id and on: true or false.");
    }

    const id: string = body.id as string;

    const member: string = channel + "|" + id;

    const score: unknown = await redis(["ZSCORE", "dash:convs", member]);

    if(score === null) {
        return fail(404, "No conversation with that id.");
    }

    let customer_command: Command = ["SADD", "dash:restricted", id];

    if(on) {
        customer_command = ["SREM", "dash:restricted", id];
    }

    const commands: Command[] = [customer_command];

    for(const command of event_commands(member, { at: Date.now(), kind: "switch", on: on, by: "dashboard" })) {
        commands.push(command);
    }

    commands.push(["INCR", "dash:version"]);

    await pipeline(commands);

    return json({ id: id, on: on }, 200);
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await flip_switch(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
