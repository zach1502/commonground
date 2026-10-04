// Ports apart from the web app's own Playwright run (4173 and 8787), so both can run at once.
export const WEB_PORT = 4273;
export const API_PORT = 8887;
export const WEB_URL = `http://localhost:${String(WEB_PORT)}`;
export const API_URL = `http://localhost:${String(API_PORT)}`;
