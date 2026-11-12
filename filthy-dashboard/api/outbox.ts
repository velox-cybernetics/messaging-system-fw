import { json, server_error } from "./_lib/http.js";
import { redis } from "./_lib/redis.js";
import { refuse_bot } from "./_lib/session.js";
import { parse_json } from "./_lib/shop.js";


//CONSTANTS
const DRAIN: number = 50;


//DRAIN OUTBOX
//bot polls this every 10s, LPOP hands each reply out once so a crash loses it instead of texting the customer twice
async function drain_outbox(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    const items: unknown = await redis(["LPOP", "dash:outbox", DRAIN]);

    const messages: unknown[] = [];

    if(Array.isArray(items)) {
        for(const item of items as unknown[]) {
            const message: unknown = parse_json(item);

            if(message !== null) {
                messages.push(message);
            }
        }
    }

    return json({ messages: messages }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await drain_outbox(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
