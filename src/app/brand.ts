/** Product name, used in the header, document title and download names. */
export const APP_NAME = "QisPlay";

/**
 * SEO and sharing metadata. Consumed by `vite-seo.ts` at build time (meta tags,
 * JSON-LD, sitemap, robots.txt). User-facing text: just "Python", never the runtime.
 */
export const APP_TITLE = "QisPlay – Online Python & Qiskit Playground";
export const APP_DESCRIPTION =
  "Write and run Python, Qiskit and Qiskit Aer quantum circuits in your browser. A free online editor, console and plots with nothing to install.";
export const APP_KEYWORDS =
  "qiskit playground, online python editor, run qiskit online, quantum computing, quantum circuit simulator, qiskit aer, python in browser";
export const APP_AUTHOR = "Krishna Upadhyay";

/**
 * Canonical origin of the deployed site, without a trailing slash. Override per
 * environment with the `SITE_URL` env var (e.g. in Cloudflare Pages) when it differs.
 */
export const DEFAULT_SITE_URL = "https://qisplay.nepcodex.com";
