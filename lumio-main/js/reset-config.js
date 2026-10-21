// URL of your Vercel function (see the infinix-vercel-function folder / steps).
// After deploying, replace YOUR-PROJECT with your real Vercel project name.
export const RESET_API_URL = "https://infinix-reset.vercel.app/api/reset-password";

// Used by "Forgot password" to check the account exists before saving the request (same Vercel project).
export const REQUEST_API_URL = RESET_API_URL.replace(/reset-password$/, "request-reset");

// WhatsApp number of the admin (country code, no + or spaces).
export const ADMIN_WHATSAPP = "919677844540";
