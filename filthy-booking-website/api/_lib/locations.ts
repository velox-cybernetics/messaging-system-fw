//TYPES
export type Location = { label: string, address: string };


//LOCATIONS
//keys are what the client sends, keep in step with LOCATION_OPTIONS in the client app
export const LOCATIONS: Record<string, Location> = { "cypress": { label: "Cypress", address: "12015 Woodworth Dr, Cypress, TX 77429" }, "houston": { label: "Houston", address: "6003 N Shepherd Dr, Houston, TX 77091" } };


//KNOWN LOCATION
export function is_known_location(location: unknown): boolean {
    return Object.keys(LOCATIONS).includes(String(location));
}
