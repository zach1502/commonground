// Vercel runs functions from the api/ directory. The handlers live in src/entry.vercel.ts,
// and the build step compiles them to dist before Vercel bundles this file.
export { DELETE, GET, OPTIONS, PATCH, POST, PUT } from '../dist/entry.vercel.js';
