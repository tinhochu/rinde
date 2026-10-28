// Where the app and its API live; set at build time (VITE_APP_ORIGIN, VITE_API_ORIGIN).
export const APP_ORIGIN: string = import.meta.env.VITE_APP_ORIGIN ?? "https://app.rinde.cool.chuventures.com";
export const API_ORIGIN: string = import.meta.env.VITE_API_ORIGIN ?? "https://rinde-api.cool.chuventures.com";
export const APP_URL = `${APP_ORIGIN}/`;
