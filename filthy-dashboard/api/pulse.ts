import { json, server_error } from "./_lib/http.js";
import { as_number, as_strings, redis } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";


//PULSE
//pages poll this so keep it one read, every write bumps dash:version and up_last is the bots last check in
async function pulse(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const values: string[] = as_strings(await redis(["MGET", "dash:version", "dash:up_last"]));

    return json({ version: as_number(values[0]), upLast: as_number(values[1]) }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await pulse(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
