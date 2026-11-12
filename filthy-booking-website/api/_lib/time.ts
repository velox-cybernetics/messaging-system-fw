//CONSTANTS
//booking dates and times are wall clock in the shop's timezone, not utc
export const BUSINESS_TIMEZONE: string = "America/Chicago";

const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

const TIME_PATTERN: RegExp = /^\d{1,2}:\d{2}$/;


//WALL TIME
//returns NaN when the date or time isnt in the right shape
export function wall_time_to_utc_ms(date_text: string, time_text: string): number {
    if(!DATE_PATTERN.test(date_text) || !TIME_PATTERN.test(time_text)) {
        return NaN;
    }

    const date_parts: string[] = date_text.split("-");

    const time_parts: string[] = time_text.split(":");

    const year: number = Number(date_parts[0]);

    const month: number = Number(date_parts[1]);

    const day: number = Number(date_parts[2]);

    const hour: number = Number(time_parts[0]);

    const minute: number = Number(time_parts[1]);

    //first guess: pretend the wall clock is utc
    const utc_guess: number = Date.UTC(year, month - 1, day, hour, minute, 0);

    const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

    const format_parts: Intl.DateTimeFormatPart[] = formatter.formatToParts(new Date(utc_guess));

    const parts: Record<string, string> = {};

    for(const part of format_parts) {
        parts[part.type] = part.value;
    }

    const seen_in_zone: number = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));

    //the gap between the guess and how the zone shows it is the zone offset
    return utc_guess + (utc_guess - seen_in_zone);
}


//BUSINESS DATE
//en-CA prints YYYY-MM-DD
export function business_date(ms: number): string {
    const formatter: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

    return formatter.format(new Date(ms));
}


//ADD DAYS
export function add_days(date_text: string, days: number): string {
    const date_parts: string[] = date_text.split("-");

    const year: number = Number(date_parts[0]);

    const month: number = Number(date_parts[1]);

    const day: number = Number(date_parts[2]);

    const date: Date = new Date(Date.UTC(year, month - 1, day));

    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
}
