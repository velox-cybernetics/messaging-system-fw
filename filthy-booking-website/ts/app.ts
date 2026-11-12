import { format_date_key, format_date_long, render_calendar } from "./calendar.js";
import { read_form, validate } from "./form.js";
import type { BookingDetails } from "./form.js";
import { format_time_label, render_timeslots } from "./timeslots.js";


//TYPES
type ServiceOption = { value: string, label: string, deposit: number, note: string, custom: boolean };

type LocationOption = { value: string, label: string, address: string };


//CONSTANTS
const VIEWS: string[] = ["location", "service", "calendar", "timeslots", "form"];

const STEP_BY_VIEW: Record<string, number> = { location: 1, service: 2, calendar: 3, timeslots: 3, form: 4 };

//success.ts reads the booking back from this key
const STORAGE_KEY: string = "filthywraps_booking";

//?ref=channel|userId from the bots booking link, sent with the booking so the server can attach the quoted price
const REF_STORAGE_KEY: string = "filthywraps_ref";


//SERVICES
//values must match api/_lib/rules, deposit is only shown here, the server decides what gets charged
const SERVICE_OPTIONS: ServiceOption[] = [];

SERVICE_OPTIONS.push({ value: "Window Tint", label: "Window Tint", deposit: 0, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Vinyl Wrap", label: "Vinyl Wrap", deposit: 500, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Colored Paint Protection Film (PPF)", label: "Colored Paint Protection Film (PPF)", deposit: 100, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Paint Protection Film (Clear)", label: "Paint Protection Film (Clear)", deposit: 100, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Frontal Paint Protection Film (Clear)", label: "Frontal Paint Protection Film (Clear)", deposit: 0, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Windshield Paint Protection Film (PPF)", label: "Windshield Paint Protection Film (PPF)", deposit: 0, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Ceramic Coating or Paint Correction", label: "Ceramic Coating or Paint Correction", deposit: 0, note: "Drop-off before 12 PM → pickup same day at closing. After 12 PM → pickup next day at 12 PM.", custom: false });

SERVICE_OPTIONS.push({ value: "Starlight Headliner", label: "Starlight Headliner", deposit: 100, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Caliper Wraps", label: "Caliper Wraps", deposit: 0, note: "", custom: false });

SERVICE_OPTIONS.push({ value: "Other", label: "Other", deposit: 0, note: "", custom: true });


//LOCATIONS
//values must match api/_lib/locations
const LOCATION_OPTIONS: LocationOption[] = [];

LOCATION_OPTIONS.push({ value: "cypress", label: "Cypress", address: "12015 Woodworth Dr, Cypress, TX 77429" });

LOCATION_OPTIONS.push({ value: "houston", label: "Houston", address: "6003 N Shepherd Dr, Houston, TX 77091" });


//ELEMENTS
const locations_box: HTMLElement = document.getElementById("locations") as HTMLElement;

const services_box: HTMLElement = document.getElementById("services") as HTMLElement;

const calendars_box: HTMLElement = document.getElementById("calendars") as HTMLElement;

const custom_service_form: HTMLFormElement = document.getElementById("custom-service") as HTMLFormElement;

const custom_service_input: HTMLInputElement = document.getElementById("field-custom-service") as HTMLInputElement;

const timeslots_box: HTMLElement = document.getElementById("timeslots") as HTMLElement;

const booking_form: HTMLFormElement = document.getElementById("booking-form") as HTMLFormElement;

const selected_location_label: HTMLElement = document.getElementById("selected-location-label") as HTMLElement;

const selected_service_label: HTMLElement = document.getElementById("selected-service-label") as HTMLElement;

const selected_date_label: HTMLElement = document.getElementById("selected-date-label") as HTMLElement;

const service_rule_hint: HTMLElement = document.getElementById("service-rule-hint") as HTMLElement;

const selected_summary_label: HTMLElement = document.getElementById("selected-summary-label") as HTMLElement;

const deposit_ack: HTMLElement = document.getElementById("deposit-ack") as HTMLElement;

const deposit_ack_checkbox: HTMLInputElement = document.getElementById("field-deposit-ack") as HTMLInputElement;

const deposit_ack_text: HTMLElement = document.getElementById("deposit-ack-text") as HTMLElement;

const back_to_location_button: HTMLElement = document.getElementById("back-to-location") as HTMLElement;

const back_to_service_button: HTMLElement = document.getElementById("back-to-service") as HTMLElement;

const back_to_calendar_button: HTMLElement = document.getElementById("back-to-calendar") as HTMLElement;

const back_to_timeslots_button: HTMLElement = document.getElementById("back-to-timeslots") as HTMLElement;

const step_items: NodeListOf<HTMLElement> = document.querySelectorAll(".steps__item");


//STATE
const today: Date = new Date();

let max_date: Date = new Date();

let selected_location: string | null = null;

let selected_service: string | null = null;

let custom_service: string = "";

let selected_date: Date | null = null;

let selected_time: string | null = null;

let current_view: string = "location";

//"YYYY-MM-DD" -> taken start times for the picked location + service
let taken_by_date: Record<string, string[]> = {};

let submit_primed: boolean = false;


//CAPTURE REF
function capture_ref(): void {
    try {
        const ref: string | null = new URLSearchParams(window.location.search).get("ref");

        if(ref) {
            sessionStorage.setItem(REF_STORAGE_KEY, ref);
        }
    } catch(error: unknown) {
        return;
    }
}


//STORED REF
function stored_ref(): string {
    try {
        const ref: string | null = sessionStorage.getItem(REF_STORAGE_KEY);

        if(ref) {
            return ref;
        }

        return "";
    } catch(error: unknown) {
        return "";
    }
}


//OPTION FOR
function option_for(value: string | null): ServiceOption | null {
    for(const option of SERVICE_OPTIONS) {
        if(option.value === value) {
            return option;
        }
    }

    return null;
}


//LOCATION FOR
function location_for(value: string | null): LocationOption | null {
    for(const option of LOCATION_OPTIONS) {
        if(option.value === value) {
            return option;
        }
    }

    return null;
}


//SERVICE LABEL
//other shows what they typed, same label api/book stores
function service_label(): string {
    const option: ServiceOption | null = option_for(selected_service);

    if(option !== null && option.custom) {
        return `Other (${custom_service})`;
    }

    return selected_service as string;
}


//MAX DATE
//last moment of next month
function compute_max_date(from_date: Date): Date {
    const max: Date = new Date(from_date.getFullYear(), from_date.getMonth() + 2, 0);

    max.setHours(23, 59, 59, 999);

    return max;
}


//UPDATE STEPS
function update_steps(): void {
    const active_step: number = STEP_BY_VIEW[current_view] as number;

    for(const item of step_items) {
        const step: number = parseInt(item.dataset.step as string, 10);

        item.classList.toggle("is-active", step === active_step);

        item.classList.toggle("is-complete", step < active_step);
    }
}


//SHOW VIEW
function show_view(view_name: string): void {
    current_view = view_name;

    for(const name of VIEWS) {
        const view: HTMLElement | null = document.getElementById(`view-${name}`);

        if(view !== null) {
            view.classList.toggle("is-active", name === view_name);
        }
    }

    update_steps();

    window.scrollTo({ top: 0, behavior: "smooth" });
}


//FETCH AVAILABILITY
async function fetch_availability(): Promise<void> {
    const location: string | null = selected_location;

    const service: string | null = selected_service;

    if(!location || !service) {
        return;
    }

    const start: string = format_date_key(today);

    const end: string = format_date_key(max_date);

    const url: string = `/api/availability?location=${encodeURIComponent(location)}&service=${encodeURIComponent(service)}&start=${start}&end=${end}`;

    //soft fail so the calendar still renders
    let taken: Record<string, string[]> = {};

    try {
        const response: Response = await fetch(url, { cache: "no-store" });

        if(response.ok) {
            const data: Record<string, unknown> = await response.json() as Record<string, unknown>;

            if(data.taken) {
                taken = data.taken as Record<string, string[]>;
            }
        }
    } catch(error: unknown) {
        console.error("AVAILABILITY ERROR: " + String(error));
    }

    //drop a late answer for a pick they already backed out of
    if(selected_location === location && selected_service === service) {
        taken_by_date = taken;
    }
}


//CLICKED INDEX
//buttons are built in the same order as the options list
function clicked_index(event: MouseEvent, container: HTMLElement): number {
    for(let index: number = 0; index < container.children.length; index++) {
        if(container.children[index] === event.currentTarget) {
            return index;
        }
    }

    return -1;
}


//CLICK LOCATION
function click_location(event: MouseEvent): void {
    const option: LocationOption = LOCATION_OPTIONS[clicked_index(event, locations_box)] as LocationOption;

    select_location(option.value);
}


//CLICK SERVICE
async function click_service(event: MouseEvent): Promise<void> {
    const option: ServiceOption = SERVICE_OPTIONS[clicked_index(event, services_box)] as ServiceOption;

    await select_service(option.value);
}


//RENDER LOCATIONS
function render_locations(): void {
    locations_box.innerHTML = "";

    for(const option of LOCATION_OPTIONS) {
        const button: HTMLButtonElement = document.createElement("button");

        button.type = "button";

        button.className = "service-btn";

        if(selected_location === option.value) {
            button.classList.add("service-btn--selected");
        }

        const name: HTMLSpanElement = document.createElement("span");

        name.className = "service-btn__name";

        name.textContent = option.label;

        const address: HTMLSpanElement = document.createElement("span");

        address.className = "location-btn__address";

        address.textContent = option.address;

        name.appendChild(address);

        button.appendChild(name);

        button.addEventListener("click", click_location);

        locations_box.appendChild(button);
    }
}


//RENDER SERVICES
function render_services(): void {
    services_box.innerHTML = "";

    for(const option of SERVICE_OPTIONS) {
        const button: HTMLButtonElement = document.createElement("button");

        button.type = "button";

        button.className = "service-btn";

        if(selected_service === option.value) {
            button.classList.add("service-btn--selected");
        }

        const name: HTMLSpanElement = document.createElement("span");

        name.className = "service-btn__name";

        name.textContent = option.label;

        button.appendChild(name);

        if(option.deposit) {
            const badge: HTMLSpanElement = document.createElement("span");

            badge.className = "service-btn__badge";

            badge.textContent = `$${option.deposit} deposit`;

            button.appendChild(badge);
        }

        button.addEventListener("click", click_service);

        services_box.appendChild(button);
    }
}


//CALENDAR DAYS
function show_calendar_days(): void {
    render_calendar(calendars_box, { today: today, max_date: max_date, selected_date: selected_date, taken_by_date: taken_by_date, on_select_date: select_date });
}


//SHOW TIMESLOTS
function show_timeslots(): void {
    const date: Date = selected_date as Date;

    selected_date_label.textContent = format_date_long(date);

    const option: ServiceOption | null = option_for(selected_service);

    let hint: string = "";

    if(option !== null && option.note) {
        hint = option.note;
    }

    service_rule_hint.textContent = hint;

    let taken_times: string[] | undefined = taken_by_date[format_date_key(date)];

    if(!taken_times) {
        taken_times = [];
    }

    render_timeslots(timeslots_box, { selected_date: date, selected_time: selected_time, taken_times: taken_times, on_select_time: select_time });
}


//FORM HEADER
function render_form_header(): void {
    const date_text: string = format_date_long(selected_date as Date);

    const time_text: string = format_time_label(selected_time as string);

    const location: LocationOption | null = location_for(selected_location);

    let location_text: string = "";

    if(location !== null) {
        location_text = ` — ${location.label}`;
    }

    selected_summary_label.textContent = `${service_label()} — ${date_text} at ${time_text}${location_text}`;

    //deposit services have to tick the non-refundable box before booking
    const option: ServiceOption | null = option_for(selected_service);

    let needs_ack: boolean = false;

    if(option !== null && option.deposit) {
        needs_ack = true;
    }

    deposit_ack.hidden = !needs_ack;

    deposit_ack_checkbox.checked = false;

    let ack_text: string = "";

    if(option !== null && needs_ack) {
        ack_text = `I understand the $${option.deposit} deposit is non-refundable.`;
    }

    deposit_ack_text.textContent = ack_text;
}


//SELECT LOCATION
function select_location(location_value: string): void {
    selected_location = location_value;

    render_locations();

    const location: LocationOption | null = location_for(location_value);

    let label: string = "";

    if(location !== null) {
        label = `${location.label} — ${location.address}`;
    }

    selected_location_label.textContent = label;

    show_view("service");
}


//SHOW CALENDAR
async function show_calendar(): Promise<void> {
    selected_service_label.textContent = service_label();

    //show the calendar right away then redraw once availability is in
    show_calendar_days();

    show_view("calendar");

    await fetch_availability();

    show_calendar_days();
}


//SELECT SERVICE
async function select_service(service: string): Promise<void> {
    selected_service = service;

    selected_date = null;

    selected_time = null;

    //the last services availability doesnt apply anymore
    taken_by_date = {};

    render_services();

    const option: ServiceOption | null = option_for(service);

    let is_custom: boolean = false;

    if(option !== null && option.custom) {
        is_custom = true;
    }

    custom_service_form.hidden = !is_custom;

    //other waits for a description before moving on
    if(is_custom) {
        custom_service_input.focus();

        return;
    }

    custom_service = "";

    await show_calendar();
}


//CUSTOM SERVICE
async function submit_custom_service(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    const text: string = custom_service_input.value.replace(/\s+/g, " ").trim();

    if(!text) {
        alert("Please describe the service you need.");

        custom_service_input.focus();

        return;
    }

    custom_service = text;

    await show_calendar();
}


//SELECT DATE
function select_date(date: Date): void {
    selected_date = date;

    selected_time = null;

    show_timeslots();

    show_view("timeslots");
}


//SELECT TIME
function select_time(time: string): void {
    selected_time = time;

    render_form_header();

    show_view("form");

    prime_submit();
}


//WARM UP
//reading the empty body lets the request finish instead of showing as cancelled once the page navigates
async function warm_up_booking(): Promise<void> {
    try {
        const response: Response = await fetch("/api/book", { method: "HEAD" });

        await response.text();
    } catch(error: unknown) {
        return;
    }
}


//PRIME SUBMIT
//wake the booking function so the submit skips the cold start, and prefetch the thanks page
function prime_submit(): void {
    if(submit_primed) {
        return;
    }

    submit_primed = true;

    warm_up_booking();

    const prefetch_paths: string[] = ["success.html", "css/success.css", "js/success.js"];

    for(const href of prefetch_paths) {
        const link: HTMLLinkElement = document.createElement("link");

        link.rel = "prefetch";

        link.href = href;

        document.head.appendChild(link);
    }
}


//SAVE BOOKING
//success.html shows it, not critical if storage is blocked
function save_booking(booking: Record<string, unknown>): void {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(booking));
    } catch(error: unknown) {
        return;
    }
}


//RESTORE BUTTON
function restore_button(submit_button: HTMLButtonElement | null, original_text: string | null): void {
    if(submit_button === null) {
        return;
    }

    submit_button.disabled = false;

    if(original_text !== null) {
        submit_button.textContent = original_text;
    }
}


//SUBMIT BOOKING
async function submit_booking(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if(!selected_location || !selected_service || !selected_date || !selected_time) {
        alert("Please choose a location, service, date, and time first.");

        show_view("location");

        return;
    }

    const data: BookingDetails = read_form(booking_form);

    const errors: Record<string, string> = validate(data);

    const error_fields: string[] = Object.keys(errors);

    if(error_fields.length > 0) {
        const first_field: string = error_fields[0] as string;

        const field: HTMLInputElement | null = booking_form.elements.namedItem(first_field) as HTMLInputElement | null;

        if(field) {
            field.focus();
        }

        alert(errors[first_field]);

        return;
    }

    const option: ServiceOption | null = option_for(selected_service);

    if(option !== null && option.deposit && !deposit_ack_checkbox.checked) {
        alert(`Please check the box acknowledging the $${option.deposit} deposit is non-refundable.`);

        deposit_ack_checkbox.focus();

        return;
    }

    const location: LocationOption | null = location_for(selected_location);

    let location_label: string = "";

    let location_address: string = "";

    if(location !== null) {
        location_label = location.label;

        location_address = location.address;
    }

    let deposit_dollars: number = 0;

    if(option !== null && option.deposit) {
        deposit_dollars = option.deposit;
    }

    //BUILD THE BOOKING
    //key order matters, its the json the server and success page get
    const booking: Record<string, unknown> = {};

    booking.date = format_date_key(selected_date);

    booking.dateLabel = format_date_long(selected_date);

    booking.time = selected_time;

    booking.timeLabel = format_time_label(selected_time);

    booking.service = selected_service;

    booking.serviceLabel = service_label();

    if(option !== null && option.custom) {
        booking.customService = custom_service;
    }

    booking.location = selected_location;

    booking.locationLabel = location_label;

    booking.locationAddress = location_address;

    booking.depositDollars = deposit_dollars;

    booking.name = data.name;

    booking.phone = data.phone;

    const ref: string = stored_ref();

    if(ref) {
        booking.ref = ref;
    }

    //SEND IT
    const submit_button: HTMLButtonElement | null = booking_form.querySelector(".submit-btn");

    let original_text: string | null = null;

    if(submit_button !== null) {
        original_text = submit_button.textContent;

        submit_button.disabled = true;

        submit_button.textContent = "Booking…";
    }

    let response: Response;

    try {
        response = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(booking) });
    } catch(error: unknown) {
        console.error("BOOKING ERROR: " + String(error));

        alert("Network error — please try again.");

        restore_button(submit_button, original_text);

        return;
    }

    if(response.status === 409) {
        alert("That time was just taken. Please pick another time.");

        await fetch_availability();

        show_calendar_days();

        selected_time = null;

        show_timeslots();

        show_view("timeslots");

        restore_button(submit_button, original_text);

        return;
    }

    if(!response.ok) {
        alert("Sorry, something went wrong. Please try again.");

        restore_button(submit_button, original_text);

        return;
    }

    //HANDLE THE ANSWER
    let result: Record<string, unknown> | null = null;

    try {
        const parsed: unknown = await response.json();

        if(typeof parsed === "object" && parsed !== null) {
            result = parsed as Record<string, unknown>;
        }
    } catch(error: unknown) {
        result = null;
    }

    if(result !== null && result.bookingId) {
        booking.id = result.bookingId;
    }

    save_booking(booking);

    //deposit services go to the square hosted checkout
    if(result !== null && result.requiresDeposit && result.checkoutUrl) {
        window.location.href = result.checkoutUrl as string;

        return;
    }

    window.location.replace("success.html");
}


//BACK TO LOCATION
function back_to_location(): void {
    show_view("location");
}


//BACK TO SERVICE
function back_to_service(): void {
    show_view("service");
}


//BACK TO CALENDAR
function back_to_calendar(): void {
    show_view("calendar");
}


//BACK TO TIMESLOTS
function back_to_timeslots(): void {
    show_timeslots();

    show_view("timeslots");
}


//INIT
function init(): void {
    capture_ref();

    today.setHours(0, 0, 0, 0);

    max_date = compute_max_date(today);

    render_locations();

    render_services();

    show_view("location");

    back_to_location_button.addEventListener("click", back_to_location);

    back_to_service_button.addEventListener("click", back_to_service);

    back_to_calendar_button.addEventListener("click", back_to_calendar);

    back_to_timeslots_button.addEventListener("click", back_to_timeslots);

    booking_form.addEventListener("submit", submit_booking);

    custom_service_form.addEventListener("submit", submit_custom_service);
}


//START
document.addEventListener("DOMContentLoaded", init);
