import { json, server_error } from "./_lib/http.js";
import { as_strings, pipeline, redis } from "./_lib/redis.js";
import { refuse_bot } from "./_lib/session.js";
import { split_member, type Member } from "./_lib/shop.js";


//RESTRICTED IDS
//the bot checks this before it answers or sends anything, a channel switched off lists everyone with a convo on it
async function restricted_ids(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    const answers: unknown[] = await pipeline([["SMEMBERS", "dash:restricted"], ["SMEMBERS", "dash:off_channels"]]);

    const restricted: Set<string> = new Set(as_strings(answers[0]));

    const off_channels: Set<string> = new Set(as_strings(answers[1]));

    if(off_channels.size > 0) {
        const members: string[] = as_strings(await redis(["ZRANGE", "dash:convs", 0, -1]));

        for(const member of members) {
            const where: Member | null = split_member(member);

            if(where !== null && off_channels.has(where.channel)) {
                restricted.add(where.id);
            }
        }
    }

    const ids: string[] = [];

    for(const id of restricted) {
        ids.push(id);
    }

    return json({ restricted: ids }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await restricted_ids(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
