import { api, ApiError, by_id } from "./shared.js";


//ELEMENTS
const login_form: HTMLFormElement = by_id("login-form") as HTMLFormElement;

const password_input: HTMLInputElement = by_id("password") as HTMLInputElement;

const error_text: HTMLParagraphElement = by_id("login-error") as HTMLParagraphElement;

const login_button: HTMLButtonElement = by_id("login-button") as HTMLButtonElement;


//SAFE DESTINATION
//only pages on this site so a crafted ?next= cant bounce the new session somewhere else
function safe_destination(): string {
    try {
        let next_path: string | null = new URLSearchParams(location.search).get("next");

        if(next_path === null) {
            next_path = "/";
        }

        const next_url: URL = new URL(next_path, location.origin);

        if(next_url.origin !== location.origin) {
            return "/";
        }

        return next_url.pathname + next_url.search + next_url.hash;
    } catch(error: unknown) {
        return "/";
    }
}


//SUBMIT LOGIN
async function submit_login(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    error_text.hidden = true;

    login_button.disabled = true;

    try {
        await api("/api/login", "POST", { password: password_input.value });

        location.assign(destination);
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            error_text.textContent = error.message;
        } else {
            error_text.textContent = "Couldn't reach the server. Check your connection and try again.";
        }

        error_text.hidden = false;

        password_input.select();
    } finally {
        login_button.disabled = false;
    }
}


//START
const destination: string = safe_destination();

password_input.focus();

login_form.addEventListener("submit", submit_login);
