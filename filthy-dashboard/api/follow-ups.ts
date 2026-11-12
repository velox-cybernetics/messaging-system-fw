import { json, server_error } from "./_lib/http.js";
import { as_strings, pipeline, redis, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { CHANNEL_TABS, fields_of, is_channel, parse_json, type Channel, type Tab } from "./_lib/shop.js";


//CONSTANTS
//keep in step with FOLLOWUP_HOUR, FOLLOWUP_WAIT_HOURS and MAX_FOLLOWUPS in helpers/followup.py
const SEND_HOUR: number = 8;

const WAIT_HOURS: number = 12;

const MAX_IN_ROW: number = 5;


//TYPES
//number is which follow up in a row it was since the customer last wrote
type FollowUp = { at: number, number: number };

//tab goes null once the convo was deleted on messages
type Customer = { id: string, name: string, channel: Channel, tab: Tab | null, sent: FollowUp[] };


//LAST SENT
function last_sent(customer: Customer): number {
    if(customer.sent.length === 0) {
        return 0;
    }

    const last: FollowUp = customer.sent[customer.sent.length - 1] as FollowUp;

    return last.at;
}


//NEWEST FIRST
function newest_first(first: Customer, second: Customer): number {
    return last_sent(second) - last_sent(first);
}


//LIST FOLLOW UPS
//every follow up out in the last two weeks by customer, the same dash:followups:sent ones the overview counts
async function list_follow_ups(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const customers: Record<string, Customer> = {};

    const lines: string[] = as_strings(await redis(["ZRANGE", "dash:followups:sent", 0, -1]));

    //oldest first so each customers follow ups come out in order
    for(const line of lines) {
        const fields: Record<string, unknown> = fields_of(parse_json(line));

        const at: number = Number(fields.at);

        const number: number = Number(fields.number);

        if(typeof fields.id !== "string" || !is_channel(fields.channel) || !Number.isFinite(at) || at <= 0) {
            continue;
        }

        const channel: Channel = fields.channel as Channel;

        const member: string = channel + "|" + fields.id;

        let customer: Customer | undefined = customers[member];

        if(customer === undefined) {
            customer = { id: fields.id, name: "", channel: channel, tab: null, sent: [] };
        }

        let row_number: number = 1;

        if(Number.isInteger(number) && number > 0) {
            row_number = number;
        }

        customer.sent.push({ at: at, number: row_number });

        customers[member] = customer;
    }

    const members: string[] = Object.keys(customers);

    if(members.length > 0) {
        const score_command: Command = ["ZMSCORE", "dash:convs"];

        for(const member of members) {
            score_command.push(member);
        }

        const commands: Command[] = [score_command];

        for(const member of members) {
            commands.push(["HGET", "dash:conv:" + member, "username"]);
        }

        const answers: unknown[] = await pipeline(commands);

        const scores: unknown = answers[0];

        for(let index: number = 0; index < members.length; index++) {
            const customer: Customer = customers[members[index] as string] as Customer;

            let listed: boolean = false;

            if(Array.isArray(scores) && scores[index] !== null && scores[index] !== undefined) {
                listed = true;
            }

            if(listed) {
                customer.tab = CHANNEL_TABS[customer.channel];
            } else {
                customer.tab = null;
            }

            const name: unknown = answers[index + 1];

            if(typeof name === "string") {
                customer.name = name;
            } else {
                customer.name = "";
            }
        }
    }

    const sorted: Customer[] = [];

    for(const member of members) {
        sorted.push(customers[member] as Customer);
    }

    sorted.sort(newest_first);

    return json({ sendHour: SEND_HOUR, waitHours: WAIT_HOURS, maxInRow: MAX_IN_ROW, customers: sorted }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await list_follow_ups(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
