import { get_slot_times_for_date } from "./timeslots.js";


//CONSTANTS
const WEEKDAYS: string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES: string[] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];


//TYPES
type DateHandler = (date: Date) => void;

type CalendarState = { today: Date, max_date: Date, selected_date: Date | null, taken_by_date: Record<string, string[]>, on_select_date: DateHandler };


//STATE
let select_handler: DateHandler | null = null;


//START OF DAY
function start_of_day(date: Date): Date {
    const day: Date = new Date(date);

    day.setHours(0, 0, 0, 0);

    return day;
}


//SAME DAY
function is_same_day(first: Date, second: Date): boolean {
    if(first.getFullYear() !== second.getFullYear()) {
        return false;
    }

    if(first.getMonth() !== second.getMonth()) {
        return false;
    }

    return first.getDate() === second.getDate();
}


//DATE KEY
export function format_date_key(date: Date): string {
    const year: number = date.getFullYear();

    const month: string = String(date.getMonth() + 1).padStart(2, "0");

    const day: string = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


//DATE LONG
export function format_date_long(date: Date): string {
    const weekday: string = WEEKDAYS[date.getDay()] as string;

    const month: string = MONTH_NAMES[date.getMonth()] as string;

    return `${weekday}, ${month} ${date.getDate()}, ${date.getFullYear()}`;
}


//DAY AVAILABLE
function is_day_available(date: Date, today: Date, max_date: Date): boolean {
    const day: Date = start_of_day(date);

    if(day < today) {
        return false;
    }

    if(day > max_date) {
        return false;
    }

    //closed sundays
    if(day.getDay() === 0) {
        return false;
    }

    return true;
}


//FULLY BOOKED
function is_day_fully_booked(date: Date, taken_by_date: Record<string, string[]>): boolean {
    const key: string = format_date_key(date);

    let taken: string[] | undefined = taken_by_date[key];

    if(!taken) {
        taken = [];
    }

    const total: number = get_slot_times_for_date(date).length;

    if(total === 0) {
        return false;
    }

    return taken.length >= total;
}


//CLICK DAY
//data-date is only set on the clickable days so read the date back from it
function click_day(event: MouseEvent): void {
    const button: HTMLButtonElement = event.currentTarget as HTMLButtonElement;

    const parts: string[] = (button.dataset.date as string).split("-");

    const date: Date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

    if(select_handler !== null) {
        select_handler(date);
    }
}


//RENDER MONTH
function render_month(container: HTMLElement, year: number, month: number, state: CalendarState): void {
    const today: Date = start_of_day(state.today);

    const max_date: Date = start_of_day(state.max_date);

    const calendar: HTMLDivElement = document.createElement("div");

    calendar.className = "calendar";

    const header: HTMLDivElement = document.createElement("div");

    header.className = "calendar__header";

    header.textContent = `${MONTH_NAMES[month]} ${year}`;

    calendar.appendChild(header);

    const grid: HTMLDivElement = document.createElement("div");

    grid.className = "calendar__grid";

    for(const label of WEEKDAYS) {
        const weekday: HTMLDivElement = document.createElement("div");

        weekday.className = "calendar__weekday";

        weekday.textContent = label;

        grid.appendChild(weekday);
    }

    const first_of_month: Date = new Date(year, month, 1);

    const leading_blanks: number = first_of_month.getDay();

    const days_in_month: number = new Date(year, month + 1, 0).getDate();

    for(let index: number = 0; index < leading_blanks; index++) {
        const blank: HTMLDivElement = document.createElement("div");

        blank.className = "calendar__day calendar__day--blank";

        grid.appendChild(blank);
    }

    for(let day: number = 1; day <= days_in_month; day++) {
        const date: Date = new Date(year, month, day);

        const button: HTMLButtonElement = document.createElement("button");

        button.type = "button";

        button.className = "calendar__day";

        button.textContent = String(day);

        const is_past: boolean = date < today;

        const is_available: boolean = is_day_available(date, today, max_date);

        if(is_same_day(date, today)) {
            button.classList.add("calendar__day--today");
        }

        let fully_booked: boolean = false;

        if(is_available) {
            fully_booked = is_day_fully_booked(date, state.taken_by_date);
        }

        if(is_past) {
            button.classList.add("calendar__day--past");

            button.disabled = true;
        } else if(!is_available || fully_booked) {
            button.classList.add("calendar__day--unavailable");

            button.disabled = true;

            if(fully_booked) {
                button.title = "Fully booked";
            }
        } else {
            button.classList.add("calendar__day--available");

            button.dataset.date = format_date_key(date);

            if(state.selected_date !== null && is_same_day(date, state.selected_date)) {
                button.classList.add("calendar__day--selected");
            }

            button.addEventListener("click", click_day);
        }

        grid.appendChild(button);
    }

    calendar.appendChild(grid);

    container.appendChild(calendar);
}


//RENDER CALENDAR
//this month and next month
export function render_calendar(container: HTMLElement, state: CalendarState): void {
    container.innerHTML = "";

    select_handler = state.on_select_date;

    const today: Date = start_of_day(state.today);

    const current_month: number = today.getMonth();

    const current_year: number = today.getFullYear();

    render_month(container, current_year, current_month, state);

    const next: Date = new Date(current_year, current_month + 1, 1);

    render_month(container, next.getFullYear(), next.getMonth(), state);
}
