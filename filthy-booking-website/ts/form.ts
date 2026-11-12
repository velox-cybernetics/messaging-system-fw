//CONSTANTS
const NON_DIGITS: RegExp = /\D/g;


//TYPES
export type BookingDetails = { name: string, phone: string };


//VALIDATE
export function validate(form_data: BookingDetails): Record<string, string> {
    const errors: Record<string, string> = {};

    if(form_data.name.trim().length < 2) {
        errors.name = "Please enter your name.";
    }

    //phone already has the +1 from read_form so 11 digits total
    const digits: string = form_data.phone.replace(NON_DIGITS, "");

    if(digits.length !== 11) {
        errors.phone = "Please enter a valid 10-digit phone number.";
    }

    return errors;
}


//READ FORM
export function read_form(form: HTMLFormElement): BookingDetails {
    const phone_input: HTMLInputElement = form.elements.namedItem("phone") as HTMLInputElement;

    const name_input: HTMLInputElement = form.elements.namedItem("name") as HTMLInputElement;

    let digits: string = phone_input.value.replace(NON_DIGITS, "");

    //the +1 is implied so drop a 1 they typed themselves
    if(digits.length === 11 && digits.startsWith("1")) {
        digits = digits.slice(1);
    }

    let phone: string = "";

    if(digits.length > 0) {
        phone = "+1" + digits;
    }

    return { name: name_input.value.trim(), phone: phone };
}
