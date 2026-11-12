import { api, ApiError, big_number, by_id, day_text, hour_text, make_element, on_pulse, when_short } from "./shared.js";
import type { BigNumber, Pulse } from "./shared.js";


//TYPES
type Range = "day" | "week" | "month" | "ytd";

type ChartKind = "messaging" | "booking";

type Bar = { key: string, future: boolean, in: number, out: number, din: number, dout: number, links: number, booked: number };

type Totals = { in: number, out: number, din: number, dout: number, links: number, booked: number, hil: number, fu: number };

type CheckIn = { lastSeen: number, beatSeconds: number };

type Overview = { range: Range, from: string, to: string, today: string, totals: Totals, bars: Bar[], checkIn: CheckIn };

type Series = { field: "din" | "dout" | "links" | "booked", name: string, one: string | null, class_name: string };

type RangeChoice = { range: Range, label: string, period: string };


//CONSTANTS
const RANGES: RangeChoice[] = [{ range: "day", label: "Day", period: "today" }, { range: "week", label: "Week", period: "this week" }, { range: "month", label: "Month", period: "this month" }, { range: "ytd", label: "YTD", period: "this year" }];

const MESSAGING_SERIES: Series[] = [{ field: "din", name: "Messaged in", one: null, class_name: "is-in" }, { field: "dout", name: "Got a reply", one: null, class_name: "is-out" }];

//links go out right before a booking so side by side they compare links sent with jobs booked
const BOOKING_SERIES: Series[] = [{ field: "links", name: "Links sent", one: "Link sent", class_name: "is-out" }, { field: "booked", name: "Booked jobs", one: "Booked job", class_name: "is-booked" }];

const SVG: string = "http://www.w3.org/2000/svg";

const CHART_HEIGHT: number = 240;

const AXIS_WIDTH: number = 36;

const LABEL_HEIGHT: number = 26;

//room for the widest axis label like "Oct 10" or "12 AM" at 12px
const MIN_LABEL_GAP: number = 48;

//a burst of messages reloads the numbers at most this often
const RELOAD_GAP_MS: number = 30 * 1000;

const NICE_MULTIPLES: number[] = [1, 2, 2.5, 4, 5, 8, 10];

const PERCENT: Intl.NumberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });


//ELEMENTS
const range_nav: HTMLElement = by_id("ranges") as HTMLElement;

const picker: HTMLSelectElement = by_id("chart-picker") as HTMLSelectElement;

const caption: HTMLParagraphElement = by_id("caption") as HTMLParagraphElement;

const headline: HTMLElement = by_id("headline") as HTMLElement;

const chart: HTMLElement = by_id("chart") as HTMLElement;

const legend: HTMLUListElement = by_id("legend") as HTMLUListElement;

const range_buttons: HTMLElement[] = [];


//STATE
let range: Range = "day";

let kind: ChartKind = "messaging";

let latest: Overview | null = null;

let last_load: number = 0;

let reload_timer: number = 0;

//bars grow in on first load and on a picked range or chart, never on a refresh or resize
let grow_next: boolean = true;


//READ PLACE
function read_place(): void {
    const params: URLSearchParams = new URLSearchParams(location.search);

    for(const each of RANGES) {
        if(each.range === params.get("range")) {
            range = each.range;

            break;
        }
    }

    if(params.get("chart") === "booking") {
        kind = "booking";
    }
}


//REMEMBER PLACE
function remember_place(): void {
    const query: URLSearchParams = new URLSearchParams();

    if(range !== "day") {
        query.set("range", range);
    }

    if(kind !== "messaging") {
        query.set("chart", kind);
    }

    const text: string = query.toString();

    if(text !== "") {
        history.replaceState(null, "", `/?${text}`);
    } else {
        history.replaceState(null, "", "/");
    }
}


//CURRENT SERIES
function current_series(): Series[] {
    if(kind === "booking") {
        return BOOKING_SERIES;
    }

    return MESSAGING_SERIES;
}


//CAPTION TEXT
function caption_text(data: Overview): string {
    const short: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

    if(data.range === "day") {
        return `Today, ${day_text(data.today, short)}`;
    } else if(data.range === "week") {
        return `This week, ${day_text(data.from, short)} to ${day_text(data.to, short)}`;
    } else if(data.range === "month") {
        return `This month, ${day_text(data.from, short)} to ${day_text(data.to, short)}`;
    } else {
        return `This year so far, ${day_text(data.from, short)} to ${day_text(data.today, short)}`;
    }
}


//BAR TITLE
function bar_title(bar: Bar): string {
    if(range === "day") {
        const hour: number = Number(bar.key);

        return `${hour_text(hour)} to ${hour_text((hour + 1) % 24)}`;
    } else if(range === "ytd") {
        return day_text(bar.key, { month: "long" });
    } else {
        return day_text(bar.key, { weekday: "short", month: "short", day: "numeric" });
    }
}


//BAR LABEL
//empty when labeling every bar would crowd the axis
function bar_label(bar: Bar, index: number): string {
    if(range === "day") {
        if(index % 3 === 0) {
            return hour_text(index);
        }

        return "";
    } else if(range === "week") {
        return `${day_text(bar.key, { weekday: "short" })} ${Number(bar.key.slice(8))}`;
    } else if(range === "month") {
        const day: number = Number(bar.key.slice(8));

        if(day === 1 || day % 5 === 0) {
            return day_text(bar.key, { month: "short", day: "numeric" });
        }

        return "";
    } else {
        return day_text(bar.key, { month: "short" });
    }
}


//SHARE
function share(part: number, whole: number): string {
    if(whole > 0) {
        return `${PERCENT.format(Math.min(100, (part / whole) * 100))}%`;
    }

    return "–";
}


//PERIOD
function period(): string {
    for(const each of RANGES) {
        if(each.range === range) {
            return each.period;
        }
    }

    return "";
}


//PICK RANGE
async function pick_range(event: MouseEvent): Promise<void> {
    const button: HTMLElement = event.currentTarget as HTMLElement;

    const choice: RangeChoice = RANGES[range_buttons.indexOf(button)] as RangeChoice;

    range = choice.range;

    grow_next = true;

    remember_place();

    const segments: NodeListOf<Element> = range_nav.querySelectorAll(".segment");

    for(const other of segments) {
        other.setAttribute("aria-pressed", String(other === button));
    }

    await load();
}


//PICK CHART
function pick_chart(): void {
    if(picker.value === "booking") {
        kind = "booking";
    } else {
        kind = "messaging";
    }

    grow_next = true;

    remember_place();

    render();
}


//BUILD RANGES
function build_ranges(): void {
    for(const each of RANGES) {
        const button: HTMLElement = make_element("button", "", each.label);

        button.setAttribute("type", "button");

        button.setAttribute("class", "segment");

        button.setAttribute("aria-pressed", String(each.range === range));

        button.addEventListener("click", pick_range);

        range_buttons.push(button);

        range_nav.append(button);
    }
}


//RENDER HEADLINE
//messaging shows whether the system is up, booking shows the booking rate
function render_headline(): void {
    if(latest === null) {
        return;
    }

    const check_in: CheckIn = latest.checkIn;

    const totals: Totals = latest.totals;

    if(kind === "booking") {
        const figure: HTMLElement = make_element("p", "headline-figure is-booked");

        figure.append(make_element("strong", "", share(totals.booked, totals.din)));

        figure.append(` booking rate ${period()}`);

        let jobs_word: string = "booked jobs";

        if(totals.booked === 1) {
            jobs_word = "booked job";
        }

        let customers_word: string = "customers";

        if(totals.din === 1) {
            customers_word = "customer";
        }

        const detail: HTMLElement = make_element("p", "caption", `${big_number(totals.booked).exact} ${jobs_word} for ${big_number(totals.din).exact} ${customers_word} who messaged in`);

        headline.replaceChildren(figure, detail);

        return;
    }

    //a check in is due every beat, plus two minutes of slack before it counts as offline
    const running: boolean = check_in.lastSeen > 0 && Date.now() - check_in.lastSeen < (check_in.beatSeconds + 120) * 1000;

    let status: HTMLElement;

    if(check_in.lastSeen === 0) {
        status = make_element("p", "status");

        status.append(make_element("span", "dot"));

        status.append("Waiting for the system's first check-in");
    } else if(running) {
        status = make_element("p", "status is-up");

        status.append(make_element("span", "dot"));

        status.append("System running");
    } else {
        status = make_element("p", "status is-down");

        status.append(make_element("span", "dot"));

        status.append(`System offline since ${when_short(check_in.lastSeen)}`);
    }

    headline.replaceChildren(status);
}


//MAKE SVG
function make_svg(tag: string, attributes: Record<string, string | number>): SVGElement {
    const element: SVGElement = document.createElementNS(SVG, tag) as SVGElement;

    for(const name of Object.keys(attributes)) {
        element.setAttribute(name, String(attributes[name]));
    }

    return element;
}


//NICE TOP
//a round axis top that splits into four whole steps like 0, 20, 40, 60, 80
function nice_top(max: number): number {
    if(max <= 4) {
        return 4;
    }

    const step: number = max / 4;

    const power: number = Math.pow(10, Math.floor(Math.log10(step)));

    for(const multiple of NICE_MULTIPLES) {
        const candidate: number = multiple * power;

        if(candidate >= step && Number.isInteger(candidate)) {
            return candidate * 4;
        }
    }

    return 40 * power;
}


//SHOW TIP
function show_tip(bar: Bar, series: Series[], slot_left: number, slot_width: number, bar_top: number): void {
    const tip: HTMLElement = make_element("div", "tip");

    tip.append(make_element("p", "tip-title", bar_title(bar)));

    for(const each of series) {
        const row: HTMLElement = make_element("p", `tip-row ${each.class_name}-key`);

        let name: string = each.name;

        if(bar[each.field] === 1 && each.one !== null) {
            name = each.one;
        }

        row.append(make_element("strong", "", String(bar[each.field])));

        row.append(make_element("span", "", name));

        tip.append(row);
    }

    if(kind === "messaging") {
        tip.append(make_element("p", "tip-title", `${bar.in} messages, ${bar.out} replies`));
    }

    const old_tip: Element | null = chart.querySelector(".tip");

    if(old_tip !== null) {
        old_tip.remove();
    }

    chart.append(tip);

    const gap: number = 10;

    let left: number = slot_left + slot_width / 2 - tip.offsetWidth / 2;

    let top: number = bar_top - tip.offsetHeight - gap;

    //no room above the bar so the numbers sit beside its slot instead of covering it
    if(top < 0) {
        top = 0;

        if(slot_left + slot_width + gap + tip.offsetWidth <= chart.clientWidth) {
            left = slot_left + slot_width + gap;
        } else {
            left = slot_left - gap - tip.offsetWidth;
        }
    }

    tip.style.left = `${Math.min(Math.max(0, left), chart.clientWidth - tip.offsetWidth)}px`;

    tip.style.top = `${top}px`;
}


//HIDE TIP
function hide_tip(): void {
    const tip: Element | null = chart.querySelector(".tip");

    if(tip !== null) {
        tip.remove();
    }

    const active: Element | null = chart.querySelector(".slot.is-active");

    if(active !== null) {
        active.classList.remove("is-active");
    }
}


//HIDE TIP MOUSE
//a lifting finger counts as leaving, so on touch the numbers stay up until another bar is tapped
function hide_tip_for_mouse(event: PointerEvent): void {
    if(event.pointerType === "mouse") {
        hide_tip();
    }
}


//HIDE TIP OUTSIDE
function hide_tip_outside(event: PointerEvent): void {
    if(event.target instanceof Node && !chart.contains(event.target)) {
        hide_tip();
    }
}


//WIRE SLOT
function wire_slot(group: SVGElement, bar: Bar, series: Series[], left: number, slot: number, bar_top: number): void {
    function point_at_bar(): void {
        hide_tip();

        group.classList.add("is-active");

        show_tip(bar, series, left, slot, bar_top);
    }

    group.addEventListener("pointerenter", point_at_bar);

    group.addEventListener("pointerdown", point_at_bar);
}


//RENDER CHART
function render_chart(): void {
    //phones hide the chart so only draw it while it has a width
    if(latest === null || chart.clientWidth === 0) {
        return;
    }

    const series: Series[] = current_series();

    const bars: Bar[] = latest.bars;

    const width: number = chart.clientWidth;

    let max_value: number = 0;

    for(const bar of bars) {
        for(const each of series) {
            max_value = Math.max(max_value, bar[each.field]);
        }
    }

    const top: number = nice_top(max_value);

    const plot_height: number = CHART_HEIGHT - 8;

    const slot: number = (width - AXIS_WIDTH) / bars.length;

    const bar_width: number = Math.max(2, Math.min(28, (slot * 0.72) / series.length - 2));

    const group_width: number = bar_width * series.length + (series.length - 1) * 3;

    let drawing_class: string = "";

    if(grow_next) {
        drawing_class = "grow";
    }

    const drawing: SVGElement = make_svg("svg", { width: width, height: CHART_HEIGHT + LABEL_HEIGHT, viewBox: `0 0 ${width} ${CHART_HEIGHT + LABEL_HEIGHT}`, role: "img", class: drawing_class });

    grow_next = false;

    //AXIS
    for(let quarter: number = 0; quarter <= 4; quarter++) {
        const y: number = CHART_HEIGHT - (quarter / 4) * plot_height;

        let line_class: string = "grid";

        if(quarter === 0) {
            line_class = "axis";
        }

        drawing.append(make_svg("line", { x1: AXIS_WIDTH, x2: width, y1: y, y2: y, class: line_class }));

        const tick: SVGElement = make_svg("text", { x: AXIS_WIDTH - 10, y: y + 4, class: "tick", "text-anchor": "end" });

        tick.textContent = big_number((top * quarter) / 4).short;

        drawing.append(tick);
    }

    //BARS
    //on a narrow screen some labels get skipped so the shown ones never run into each other
    let last_label_x: number = -Infinity;

    for(let index: number = 0; index < bars.length; index++) {
        const bar: Bar = bars[index] as Bar;

        const left: number = AXIS_WIDTH + index * slot;

        const group: SVGElement = make_svg("g", { class: "slot" });

        group.append(make_svg("rect", { x: left, y: 0, width: slot, height: CHART_HEIGHT, class: "hit" }));

        let bar_top: number = CHART_HEIGHT;

        if(bar.future) {
            group.append(make_svg("rect", { x: left + (slot - group_width) / 2, y: CHART_HEIGHT - 2, width: group_width, height: 2, class: "later" }));
        } else {
            for(let position: number = 0; position < series.length; position++) {
                const each: Series = series[position] as Series;

                const height: number = (bar[each.field] / top) * plot_height;

                const y: number = CHART_HEIGHT - height;

                bar_top = Math.min(bar_top, y);

                const x: number = left + (slot - group_width) / 2 + position * (bar_width + 3);

                group.append(make_svg("rect", { x: x, y: y, width: bar_width, height: height, rx: Math.min(2, bar_width / 4), class: `column ${each.class_name}` }));
            }

            wire_slot(group, bar, series, left, slot, bar_top);
        }

        drawing.append(group);

        const label: string = bar_label(bar, index);

        const label_x: number = left + slot / 2;

        if(label !== "" && label_x - last_label_x >= MIN_LABEL_GAP) {
            const text: SVGElement = make_svg("text", { x: label_x, y: CHART_HEIGHT + 18, class: "tick", "text-anchor": "middle" });

            text.textContent = label;

            drawing.append(text);

            last_label_x = label_x;
        }
    }

    drawing.addEventListener("pointerleave", hide_tip_for_mouse);

    //LABEL AND NOTE
    const total_parts: string[] = [];

    for(const each of series) {
        let sum: number = 0;

        for(const bar of bars) {
            sum = sum + bar[each.field];
        }

        total_parts.push(`${sum} ${each.name.toLowerCase()}`);
    }

    let chart_name: string = "Activity";

    const picked: HTMLOptionElement | undefined = picker.selectedOptions[0];

    if(picked !== undefined) {
        chart_name = picked.text;
    }

    drawing.setAttribute("aria-label", `${chart_name}, ${caption.textContent}: ${total_parts.join(", ")}`);

    let quiet: boolean = true;

    for(const bar of bars) {
        for(const each of series) {
            if(bar[each.field] !== 0) {
                quiet = false;
            }
        }
    }

    let note: string = `No links or bookings yet ${period()}.`;

    if(kind === "messaging") {
        note = `No messages yet ${period()}.`;
    }

    if(quiet) {
        chart.replaceChildren(drawing, make_element("p", "chart-note", note));
    } else {
        chart.replaceChildren(drawing);
    }

    legend.replaceChildren();

    for(const each of series) {
        legend.append(make_element("li", `${each.class_name}-key`, each.name));
    }
}


//TOTAL FOR
function total_for(totals: Totals, name: string | undefined): number {
    if(name === undefined) {
        return 0;
    }

    const by_name: Record<string, unknown> = totals as unknown as Record<string, unknown>;

    const value: unknown = by_name[name];

    if(value === undefined || value === null) {
        return 0;
    }

    return value as number;
}


//RENDER STRIP
function render_strip(totals: Totals): void {
    const total_elements: NodeListOf<HTMLElement> = document.querySelectorAll("[data-total]");

    for(const element of total_elements) {
        const count: number = total_for(totals, element.dataset.total);

        const value: BigNumber = big_number(count);

        element.textContent = value.short;

        element.title = value.exact;

        //"1 booked job", "3 booked jobs"
        const label: Element | null = element.nextElementSibling;

        if(label instanceof HTMLElement && label.dataset.one !== undefined && label.dataset.one !== "") {
            if(label.dataset.many === undefined) {
                let many: string | null = label.textContent;

                if(many === null) {
                    many = "";
                }

                label.dataset.many = many;
            }

            if(count === 1) {
                label.textContent = label.dataset.one;
            } else {
                label.textContent = label.dataset.many;
            }
        }
    }

    const rate_elements: NodeListOf<HTMLElement> = document.querySelectorAll("[data-rate]");

    for(const element of rate_elements) {
        element.textContent = share(total_for(totals, element.dataset.rate), totals.din);
    }
}


//RENDER
function render(): void {
    if(latest === null) {
        return;
    }

    caption.textContent = caption_text(latest);

    render_headline();

    render_chart();

    render_strip(latest.totals);
}


//LOAD
async function load(): Promise<void> {
    const asked: Range = range;

    last_load = Date.now();

    try {
        const data: Overview = (await api(`/api/overview?range=${asked}`)) as Overview;

        //another range got picked while this one loaded
        if(asked !== range) {
            return;
        }

        latest = data;

        render();
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            caption.textContent = error.message;
        } else {
            caption.textContent = "Couldn't load the numbers. It retries on its own.";
        }
    }
}


//RELOAD SOON
function reload_soon(): void {
    window.clearTimeout(reload_timer);

    const wait: number = Math.max(0, last_load + RELOAD_GAP_MS - Date.now());

    reload_timer = window.setTimeout(load, wait);
}


//ON BEAT
//every pulse carries the last check in so "System running" never goes stale between reloads
function on_beat(pulse: Pulse): void {
    if(latest === null) {
        return;
    }

    if(pulse.upLast !== latest.checkIn.lastSeen) {
        latest.checkIn.lastSeen = pulse.upLast;

        render_headline();
    }
}


//START
read_place();

build_ranges();

picker.value = kind;

picker.addEventListener("change", pick_chart);

new ResizeObserver(render_chart).observe(chart);

document.addEventListener("pointerdown", hide_tip_outside);

window.setInterval(render_headline, 30 * 1000);

remember_place();

load();

on_pulse(reload_soon, on_beat);
