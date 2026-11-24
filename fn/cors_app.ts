// CORS for the functions only the onboarding pages and Tim's portal call (offer-public, offer-sign). No imports, so the tests load it.
// A browser on one of these two sites gets its own origin back; any other site gets the onboarding origin, so its browser refuses.
export const APP_ORIGINS = ["https://packages.dunnerstunner.co.nz", "https://portal.dunnerstunner.co.nz"];
export function corsFor(req: Request): Record<string, string> {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": APP_ORIGINS.includes(o) ? o : APP_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}
