import { judged_bookings } from "./_lib/booked.js";
import { fail, json, server_error } from "./_lib/http.js";
import { as_number, as_object, as_strings, pipeline, redis, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { add_days, days_in_month, fields_of, parse_json, shop_clock, two_digits, weekday_index, type Clock } from "./_lib/shop.js";


//CONSTANTS
//keep in step with FLAG_POLL_SECONDS in helpers/dashboard_sync.py, each flags ask is the bots check in
const BEAT_SECONDS: number = 60;

const RANGES: string[] = ["day", "week", "month", "ytd"];

//left out of every range for display only, their counters keep being written
const HIDDEN_MONTHS: Record<string, boolean> = { "2026-05": true, "2026-06": true, "2026-07": true };

//bookings from the system counted right now, booking id to the day (and hour) its lead went on
const LEADS_ACTIVE: string = "dash:leads:active";

//the first lead count kept this set, its ids get adopted into dash:leads:active without counting again
const LEADS_SEEN: string = "dash:leads:seen";

//"YYYY-MM-DD@HH", or "YYYY-MM-DD" from before hours were counted
const CREDIT_FORMAT: RegExp = /^(\d{4}-\d{2}-\d{2})(?:@(\d{2}))?$/;


//TYPES
//out is replies only since follow ups keep their own count in fu, leads are jobs booked through the systems link
type Counts = { in: number, out: number, links: number, leads: number, hil: number, fu: number };

type Day = { counts: Record<string, string>, in: Set<string>, out: Set<string> };

type Bar = { key: string, future: boolean, in: number, out: number, din: number, dout: number, links: number, booked: number };

type BarPlan = { key: string, future: boolean, dates: string[] };

type Plan = { from: string, to: string, dates: string[], bars: BarPlan[] };

type Credit = { date: string, hour: string | null };


//CREDITED TO
//the day and hour a lead went on, older values are a {"d": "YYYY-MM-DD"} object
function credited_to(value: string): Credit | null {
    const match: RegExpExecArray | null = CREDIT_FORMAT.exec(value);

    if(match !== null) {
        let hour: string | null = null;

        if(match[2] !== undefined) {
            hour = match[2];
        }

        return { date: match[1] as string, hour: hour };
    }

    const date: unknown = fields_of(parse_json(value)).d;

    if(typeof date === "string") {
        return { date: date, hour: null };
    }

    return null;
}


//SYNC LEADS
//booked jobs only come from the system, a cancelled one or one the system never brought in takes its lead back, one that just expired keeps it
async function sync_leads(now: number): Promise<void> {
    //once a minute at most since this reads every booking
    const claimed: unknown = await redis(["SET", "dash:leads:sync", 1, "NX", "EX", 60]);

    if(claimed !== "OK") {
        return;
    }

    const from_system: Map<string, Record<string, unknown>> = new Map();

    const taken_back: Set<string> = new Set();

    for(const each of await judged_bookings()) {
        if(each.status === "confirmed" && each.from_system.length > 0) {
            from_system.set(each.id, each.booking);
        } else if(each.status === "confirmed" || each.status === "cancelled") {
            taken_back.add(each.id);
        }
    }

    const answers: unknown[] = await pipeline([["SMEMBERS", LEADS_SEEN], ["HGETALL", LEADS_ACTIVE]]);

    const seen: Set<string> = new Set(as_strings(answers[0]));

    const active: Record<string, string> = as_object(answers[1]);

    const commands: Command[] = [];

    //COUNT NEW BOOKINGS
    for(const id of from_system.keys()) {
        const counted_at: string | undefined = active[id];

        if(counted_at !== undefined && counted_at !== "") {
            continue;
        }

        const booking: Record<string, unknown> = from_system.get(id) as Record<string, unknown>;

        let moment: number = as_number(booking.confirmedAt);

        if(moment === 0) {
            moment = as_number(booking.createdAt);
        }

        if(moment === 0) {
            moment = now;
        }

        const clock: Clock = shop_clock(moment);

        const hour: string = two_digits(clock.hour);

        const stats_key: string = "dash:stats:" + clock.date;

        if(seen.has(id)) {
            commands.push(["SREM", LEADS_SEEN, id]);

            commands.push(["HSET", LEADS_ACTIVE, id, clock.date]);
        } else {
            commands.push(["HINCRBY", stats_key, "leads", 1]);

            commands.push(["HINCRBY", stats_key, "leads@" + hour, 1]);

            commands.push(["HSET", LEADS_ACTIVE, id, clock.date + "@" + hour]);
        }
    }

    //DROP GONE BOOKINGS
    for(const id of Object.keys(active)) {
        if(from_system.has(id)) {
            continue;
        }

        let credited: Credit | null = null;

        if(taken_back.has(id)) {
            credited = credited_to(active[id] as string);
        }

        if(credited !== null) {
            commands.push(["HINCRBY", "dash:stats:" + credited.date, "leads", -1]);

            if(credited.hour !== null) {
                commands.push(["HINCRBY", "dash:stats:" + credited.date, "leads@" + credited.hour, -1]);
            }
        }

        commands.push(["HDEL", LEADS_ACTIVE, id]);
    }

    if(commands.length > 0) {
        commands.push(["INCR", "dash:version"]);

        await pipeline(commands);
    }
}


//IS COUNTED
function is_counted(date: string, today: string): boolean {
    return date <= today && !HIDDEN_MONTHS[date.slice(0, 7)];
}


//COUNTED DATES
function counted_dates(dates: string[], today: string): string[] {
    const counted: string[] = [];

    for(const date of dates) {
        if(is_counted(date, today)) {
            counted.push(date);
        }
    }

    return counted;
}


//DAY BAR PLANS
function day_bar_plans(dates: string[], today: string): BarPlan[] {
    const bars: BarPlan[] = [];

    for(const date of dates) {
        const bar_dates: string[] = [];

        if(is_counted(date, today)) {
            bar_dates.push(date);
        }

        bars.push({ key: date, future: date > today, dates: bar_dates });
    }

    return bars;
}


//PLAN
//day splits today by hour, week and month group days, ytd groups months
function plan(range: string, today: string): Plan {
    const month: string = today.slice(0, 7);

    if(range === "day") {
        return { from: today, to: today, dates: counted_dates([today], today), bars: [] };
    }

    if(range === "week") {
        const monday: string = add_days(today, -weekday_index(today));

        const week: string[] = [];

        for(let each: number = 0; each < 7; each++) {
            week.push(add_days(monday, each));
        }

        return { from: monday, to: week[6] as string, dates: counted_dates(week, today), bars: day_bar_plans(week, today) };
    }

    if(range === "month") {
        const days: string[] = [];

        const day_count: number = days_in_month(month);

        for(let each: number = 0; each < day_count; each++) {
            days.push(month + "-" + two_digits(each + 1));
        }

        return { from: days[0] as string, to: days[days.length - 1] as string, dates: counted_dates(days, today), bars: day_bar_plans(days, today) };
    }

    const year: string = today.slice(0, 4);

    const dates: string[] = [];

    for(let date: string = year + "-01-01"; date <= today; date = add_days(date, 1)) {
        if(is_counted(date, today)) {
            dates.push(date);
        }
    }

    const bars: BarPlan[] = [];

    for(let each: number = 0; each < 12; each++) {
        const key: string = year + "-" + two_digits(each + 1);

        const month_dates: string[] = [];

        for(const date of dates) {
            if(date.startsWith(key)) {
                month_dates.push(date);
            }
        }

        bars.push({ key: key, future: key > month, dates: month_dates });
    }

    return { from: year + "-01-01", to: today, dates: dates, bars: bars };
}


//SUM
function sum(days: Day[]): Counts {
    const counts: Counts = { in: 0, out: 0, links: 0, leads: 0, hil: 0, fu: 0 };

    for(const day of days) {
        counts.in += as_number(day.counts.in);

        counts.out += as_number(day.counts.out);

        counts.links += as_number(day.counts.links);

        counts.leads += as_number(day.counts.leads);

        counts.hil += as_number(day.counts.hil);

        counts.fu += as_number(day.counts.fu);
    }

    return counts;
}


//DISTINCT PEOPLE
function distinct_people(days: Day[], side: "in" | "out"): number {
    const people: Set<string> = new Set();

    for(const day of days) {
        let side_people: Set<string> = day.in;

        if(side === "out") {
            side_people = day.out;
        }

        for(const person of side_people) {
            people.add(person);
        }
    }

    return people.size;
}


//DAY BAR
function day_bar(bar: BarPlan, days: Record<string, Day>): Bar {
    const group: Day[] = [];

    for(const date of bar.dates) {
        const day: Day | undefined = days[date];

        if(day !== undefined) {
            group.push(day);
        }
    }

    const counts: Counts = sum(group);

    return { key: bar.key, future: bar.future, in: counts.in, out: counts.out, din: distinct_people(group, "in"), dout: distinct_people(group, "out"), links: counts.links, booked: counts.leads };
}


//PEOPLE IN
function people_in(people: Map<string, Set<string>>, place: string): number {
    const found: Set<string> | undefined = people.get(place);

    if(found === undefined) {
        return 0;
    }

    return found.size;
}


//HOUR BARS
//counts are fields like in@14 on the days hash, the hourly set holds members like in@14|instagram|123
function hour_bars(today: Day | undefined, hour_list: unknown, hour_now: number): Bar[] {
    const people: Map<string, Set<string>> = new Map();

    for(const entry of as_strings(hour_list)) {
        const cut: number = entry.indexOf("|");

        const place: string = entry.slice(0, cut);

        let place_people: Set<string> | undefined = people.get(place);

        if(place_people === undefined) {
            place_people = new Set();
        }

        place_people.add(entry.slice(cut + 1));

        people.set(place, place_people);
    }

    let counts: Record<string, string> = {};

    if(today !== undefined) {
        counts = today.counts;
    }

    const bars: Bar[] = [];

    for(let hour: number = 0; hour < 24; hour++) {
        const key: string = two_digits(hour);

        bars.push({ key: key, future: hour > hour_now, in: as_number(counts["in@" + key]), out: as_number(counts["out@" + key]), din: people_in(people, "in@" + key), dout: people_in(people, "out@" + key), links: as_number(counts["links@" + key]), booked: as_number(counts["leads@" + key]) });
    }

    return bars;
}


//SHOW OVERVIEW
//the numbers for a range, the bars behind them, and when the bot last checked in
async function show_overview(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const params: URLSearchParams = new URL(request.url).searchParams;

    let range: string | null = params.get("range");

    if(range === null) {
        range = "day";
    }

    if(!RANGES.includes(range)) {
        return fail(400, "Pick a range: " + RANGES.join(", ") + ".");
    }

    const now: number = Date.now();

    //a failed sync must never block the numbers themselves
    try {
        await sync_leads(now);
    } catch(error: unknown) {
        console.error("LEAD SYNC ERROR: " + String(error));
    }

    const clock: Clock = shop_clock(now);

    const layout: Plan = plan(range, clock.date);

    const commands: Command[] = [["GET", "dash:up_last"], ["SMEMBERS", "dash:uniq:hours:" + clock.date]];

    for(const date of layout.dates) {
        commands.push(["HGETALL", "dash:stats:" + date]);

        commands.push(["SMEMBERS", "dash:uniq:" + date]);

        commands.push(["SMEMBERS", "dash:uniq:out:" + date]);
    }

    const results: unknown[] = await pipeline(commands);

    const days: Record<string, Day> = {};

    const all: Day[] = [];

    for(let index: number = 0; index < layout.dates.length; index++) {
        const at: number = 2 + index * 3;

        const day: Day = { counts: as_object(results[at]), in: new Set(as_strings(results[at + 1])), out: new Set(as_strings(results[at + 2])) };

        days[layout.dates[index] as string] = day;

        all.push(day);
    }

    const counts: Counts = sum(all);

    let bars: Bar[] = [];

    if(range === "day") {
        bars = hour_bars(days[clock.date], results[1], clock.hour);
    } else {
        for(const bar of layout.bars) {
            bars.push(day_bar(bar, days));
        }
    }

    const totals: Record<string, number> = { in: counts.in, out: counts.out, din: distinct_people(all, "in"), dout: distinct_people(all, "out"), links: counts.links, booked: counts.leads, hil: counts.hil, fu: counts.fu };

    const check_in: Record<string, number> = { lastSeen: as_number(results[0]), beatSeconds: BEAT_SECONDS };

    return json({ range: range, from: layout.from, to: layout.to, today: clock.date, totals: totals, bars: bars, checkIn: check_in }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await show_overview(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
