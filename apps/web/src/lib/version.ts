import pkg from "../../package.json";

// `pnpm release` bumps apps/web/package.json with the desktop app, so this
// follows every release without a separate edit.
export const appVersion = pkg.version;
export const shortVersion = appVersion.split(".").slice(0, 2).join(".");
