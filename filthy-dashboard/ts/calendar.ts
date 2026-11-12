import { api } from "./shared.js";


//CHECK SIGN IN
//any data request sends a signed out visitor to the sign in page, like every other page with data
async function check_signed_in(): Promise<void> {
    try {
        await api("/api/pulse");
    } catch(error: unknown) {
        return;
    }
}


//START
check_signed_in();
