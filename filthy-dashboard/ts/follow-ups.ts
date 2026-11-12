import { api, ApiError, by_id, CHANNEL_NAMES, day_text, hour_text, make_element, on_pulse, readable_id, SHOP_TIME_ZONE, shop_parts } from "./shared.js";


//TYPES
//number is which follow up in a row it was, counted since the customer last wrote
type FollowUp = { at: number, number: number };

type Customer = { id: string, name: string, channel: string, tab: string | null, sent: FollowUp[] };

type FollowUps = { sendHour: number, waitHours: number, maxInRow: number, customers: Customer[] };


//CONSTANTS
//today plus the 13 days before it
const DAYS_BACK: number = 13;

//keep in step with the phone layout in base.css
const PHONE: string = "(max-width: 640px)";

//follow ups only change a few times a day so reload at most this often
const RELOAD_GAP_MS: number = 30 * 1000;

const SUFFIXES: Record<string, string> = { one: "st", two: "nd", few: "rd", other: "th" };

//customers per card so a long list reads in chunks instead of one endless table
const CARD_SIZE: number = 20;

const ORDINALS: Intl.PluralRules = new Intl.PluralRules("en-US", { type: "ordinal" });

const MOMENT: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIME_ZONE, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const SHOP_HOUR: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIME_ZONE, hour: "numeric", hourCycle: "h23" });


//ELEMENTS
const lineup: HTMLParagraphElement = by_id("lineup") as HTMLParagraphElement;

const schedule: HTMLParagraphElement = by_id("schedule") as HTMLParagraphElement;

const track: HTMLElement = by_id("track") as HTMLElement;


//STATE
let latest: FollowUps | null = null;

let last_load: number = 0;

let reload_timer: number = 0;

//midnight moves every column so remember which shop day got drawn
let drawn_for: string = "";

//null before the first draw
let drawn_sent: Record<string, boolean> | null = null;


//NTH
function nth(number: number): string {
    let suffix: string | undefined = SUFFIXES[ORDINALS.select(number)];

    if(suffix === undefined) {
        suffix = "th";
    }

    return `${number}${suffix}`;
}


//ADD DAYS
//calendar math on shop days so daylight saving never skips or repeats one
function add_days(date: string, days: number): string {
    const parts: string[] = date.split("-");

    let year: number = 1970;

    let month: number = 1;

    let day: number = 1;

    if(parts[0] !== undefined) {
        year = Number(parts[0]);
    }

    if(parts[1] !== undefined) {
        month = Number(parts[1]);
    }

    if(parts[2] !== undefined) {
        day = Number(parts[2]);
    }

    const moved: Date = new Date(Date.UTC(year, month - 1, day + days));

    return moved.toISOString().slice(0, 10);
}


//SENT KEY
function sent_key(customer: Customer, sent: FollowUp): string {
    return `${customer.channel}|${customer.id}@${sent.at}`;
}


//LINEUP TEXT
function lineup_text(data: FollowUps): string {
    const today: string = shop_parts(Date.now()).date;

    let reached: number = 0;

    for(const customer of data.customers) {
        let got_one_today: boolean = false;

        for(const each of customer.sent) {
            if(shop_parts(each.at).date === today) {
                got_one_today = true;
            }
        }

        if(got_one_today) {
            reached = reached + 1;
        }
    }

    if(reached > 0) {
        if(reached === 1) {
            return "1 customer got a follow up today.";
        }

        return `${reached} customers got a follow up today.`;
    }

    if(Number(SHOP_HOUR.format(Date.now())) < data.sendHour) {
        return `Today's follow ups go out at ${hour_text(data.sendHour)}.`;
    }

    return "Nobody got a follow up today.";
}


//DAY CLASS
function day_class(date: string, today: string): string {
    if(date === today) {
        return "day is-today";
    }

    return "day";
}


//DAY HEAD
function day_head(date: string, today: string): HTMLTableCellElement {
    const full: string = day_text(date, { weekday: "long", month: "long", day: "numeric" });

    const cell: HTMLTableCellElement = make_element("th") as HTMLTableCellElement;

    cell.setAttribute("scope", "col");

    cell.setAttribute("class", day_class(date, today));

    cell.setAttribute("title", full);

    const weekday: HTMLElement = make_element("span", "weekday", day_text(date, { weekday: "narrow" }));

    weekday.setAttribute("aria-hidden", "true");

    const day_number: HTMLElement = make_element("span", "date", day_text(date, { day: "numeric" }));

    day_number.setAttribute("aria-hidden", "true");

    cell.append(weekday);

    cell.append(day_number);

    cell.append(make_element("span", "visually-hidden", full));

    return cell;
}


//DAY CELL
//a dot for each day a follow up went out, exact times in the tooltip
function day_cell(sent: FollowUp[] | undefined, class_name: string, is_new: boolean): HTMLTableCellElement {
    const cell: HTMLTableCellElement = make_element("td", class_name) as HTMLTableCellElement;

    if(sent === undefined) {
        return cell;
    }

    const lines: string[] = [];

    for(const each of sent) {
        lines.push(`${nth(each.number)} follow up in a row, sent ${MOMENT.format(each.at)}`);
    }

    let mark_class: string = "mark is-sent";

    if(is_new) {
        mark_class = "mark is-sent is-new";
    }

    const mark: HTMLElement = make_element("span", mark_class);

    mark.setAttribute("title", lines.join("\n"));

    mark.append(make_element("span", "visually-hidden", lines.join(". ")));

    cell.append(mark);

    return cell;
}


//CUSTOMER ROW
//null when everything of theirs is older than the first day shown
function customer_row(customer: Customer, days: string[], today: string): HTMLTableRowElement | null {
    const by_date: Record<string, FollowUp[]> = {};

    for(const sent of customer.sent) {
        const date: string = shop_parts(sent.at).date;

        if(by_date[date] === undefined) {
            by_date[date] = [];
        }

        by_date[date].push(sent);
    }

    let has_shown_day: boolean = false;

    for(const date of days) {
        if(by_date[date] !== undefined) {
            has_shown_day = true;
        }
    }

    if(!has_shown_day) {
        return null;
    }

    let title: string = readable_id(customer.id);

    if(customer.name) {
        title = customer.name;
    }

    let who: HTMLElement;

    //a conversation deleted on messages has nowhere to link to
    if(customer.tab) {
        const query: URLSearchParams = new URLSearchParams({ tab: customer.tab, id: customer.id });

        who = make_element("a", "who-name", title);

        who.setAttribute("href", `/messages?${query}`);

        who.setAttribute("data-id", customer.id);
    } else {
        who = make_element("span", "who-name", title);
    }

    const row: HTMLTableRowElement = make_element("tr") as HTMLTableRowElement;

    const who_cell: HTMLElement = make_element("th");

    who_cell.setAttribute("scope", "row");

    who_cell.setAttribute("class", "who");

    who_cell.setAttribute("title", title);

    who_cell.append(who);

    row.append(who_cell);

    let channel_name: string | undefined = CHANNEL_NAMES[customer.channel];

    if(channel_name === undefined) {
        channel_name = customer.channel;
    }

    row.append(make_element("td", "channel", channel_name));

    for(const date of days) {
        const sent: FollowUp[] | undefined = by_date[date];

        let is_new: boolean = false;

        if(drawn_sent !== null && sent !== undefined) {
            for(const each of sent) {
                if(drawn_sent[sent_key(customer, each)] !== true) {
                    is_new = true;
                }
            }
        }

        row.append(day_cell(sent, day_class(date, today), is_new));
    }

    return row;
}


//BUILD CARD
//one card is its own table with the days on top, holding up to CARD_SIZE customers
function build_card(rows: HTMLTableRowElement[], days: string[], today: string, first: number, total: number): HTMLElement {
    const card: HTMLElement = make_element("section", "track-card");

    const last: number = first + rows.length - 1;

    card.append(make_element("p", "card-range", `Customers ${first}–${last} of ${total}`));

    //TABLE HEAD
    const table: HTMLElement = make_element("table");

    table.append(make_element("caption", "visually-hidden", `Follow ups by customer and day, customers ${first} to ${last}`));

    const column_group: HTMLElement = make_element("colgroup");

    column_group.append(make_element("col", "who-column"));

    column_group.append(make_element("col", "channel-column"));

    for(let index: number = 0; index < days.length; index++) {
        column_group.append(make_element("col"));
    }

    table.append(column_group);

    const head_row: HTMLElement = make_element("tr");

    const customer_head: HTMLElement = make_element("th");

    customer_head.setAttribute("scope", "col");

    customer_head.append(make_element("span", "visually-hidden", "Customer"));

    head_row.append(customer_head);

    const channel_head: HTMLElement = make_element("th");

    channel_head.setAttribute("scope", "col");

    channel_head.append(make_element("span", "visually-hidden", "Channel"));

    head_row.append(channel_head);

    for(const date of days) {
        head_row.append(day_head(date, today));
    }

    const table_head: HTMLElement = make_element("thead");

    table_head.append(head_row);

    table.append(table_head);

    //TABLE BODY
    const table_body: HTMLElement = make_element("tbody");

    for(const row of rows) {
        table_body.append(row);
    }

    table.append(table_body);

    card.append(table);

    return card;
}


//RENDER
function render(): void {
    if(latest === null) {
        return;
    }

    lineup.textContent = lineup_text(latest);

    schedule.textContent = `Sent every morning at ${hour_text(latest.sendHour)} to customers who haven't answered in ${latest.waitHours} hours, up to ${latest.maxInRow} in a row.`;

    const today: string = shop_parts(Date.now()).date;

    const days: string[] = [];

    for(let index: number = 0; index < DAYS_BACK + 1; index++) {
        days.push(add_days(today, index - DAYS_BACK));
    }

    const rows: HTMLTableRowElement[] = [];

    for(const customer of latest.customers) {
        const row: HTMLTableRowElement | null = customer_row(customer, days, today);

        if(row !== null) {
            rows.push(row);
        }
    }

    drawn_for = today;

    const all_sent: Record<string, boolean> = {};

    for(const customer of latest.customers) {
        for(const each of customer.sent) {
            all_sent[sent_key(customer, each)] = true;
        }
    }

    drawn_sent = all_sent;

    if(rows.length === 0) {
        track.replaceChildren(make_element("p", "track-note", "No follow ups went out in the last two weeks."));

        return;
    }

    //a redraw replaces the rows so the name that had focus gets it back
    let focused_id: string | undefined = undefined;

    if(document.activeElement instanceof HTMLElement) {
        focused_id = document.activeElement.dataset.id;
    }

    //chop the rows into cards of 20, the last card takes whatever is left
    const cards: HTMLElement[] = [];

    for(let start: number = 0; start < rows.length; start += CARD_SIZE) {
        const card_rows: HTMLTableRowElement[] = rows.slice(start, start + CARD_SIZE);

        cards.push(build_card(card_rows, days, today, start + 1, rows.length));
    }

    track.replaceChildren();

    for(const card of cards) {
        track.append(card);
    }

    if(focused_id) {
        const link: HTMLAnchorElement | null = track.querySelector(`a[data-id="${CSS.escape(focused_id)}"]`);

        if(link !== null) {
            link.focus();
        }
    }
}


//LOAD
async function load(): Promise<void> {
    last_load = Date.now();

    try {
        latest = (await api("/api/follow-ups")) as FollowUps;

        render();
    } catch(error: unknown) {
        let message: string = "Couldn't load follow ups. It retries on its own.";

        if(error instanceof ApiError) {
            message = error.message;
        }

        //whats on screen stays up with the error under it
        if(latest !== null) {
            schedule.textContent = message;
        } else {
            lineup.textContent = message;
        }
    }
}


//RELOAD SOON
function reload_soon(): void {
    window.clearTimeout(reload_timer);

    const wait: number = Math.max(0, last_load + RELOAD_GAP_MS - Date.now());

    reload_timer = window.setTimeout(load, wait);
}


//TICK
//the top sentence moves with the clock and midnight moves every column
function tick(): void {
    if(latest === null) {
        return;
    }

    if(shop_parts(Date.now()).date !== drawn_for) {
        render();
    } else {
        lineup.textContent = lineup_text(latest);
    }
}


//START PAGE
function start_page(): void {
    load();

    on_pulse(reload_soon);

    window.setInterval(tick, 60 * 1000);
}


//START
//phones dont get this page so they dont load it until the screen gets wider
const phone: MediaQueryList = window.matchMedia(PHONE);

if(phone.matches) {
    phone.addEventListener("change", start_page, { once: true });
} else {
    start_page();
}
