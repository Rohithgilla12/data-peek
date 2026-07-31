import type { MotionComponent } from "./motion";

// Every clip — mp4, webm and poster — is committed to apps/web/public/clips/ and
// served from there, so nothing depends on external hosting. Setting
// NEXT_PUBLIC_CLIP_BASE to a CDN or bucket prefix overrides that if the payload
// ever outgrows the repo; tools/feature-clips/upload.mjs pushes to R2 for that case.
export const CLIP_BASE = process.env.NEXT_PUBLIC_CLIP_BASE ?? "/clips";

export type ClipCategory = "editor" | "performance" | "ai" | "data" | "infra";

export type ClipMedia =
  | {
      kind: "video";
      /** Basename shared by the mp4, webm and poster in /public/clips. */
      file: string;
      width: number;
      height: number;
    }
  // Imported rather than re-declared: a local copy of this union stays assignable
  // to MotionComponent when the registry gains a fourth graphic, so the omission
  // would compile silently and leave that graphic unreachable.
  | { kind: "motion"; component: MotionComponent };

export type FeatureClip = {
  /** Kebab-case; also the URL hash fragment and the capture spec's test title. */
  id: string;
  title: string;
  blurb: string;
  category: ClipCategory;
  media: ClipMedia;
};

export const CATEGORY_LABELS: Record<ClipCategory, string> = {
  editor: "Editor",
  performance: "Performance",
  ai: "AI",
  data: "Data",
  infra: "Infrastructure",
};

export const FEATURE_CLIPS: FeatureClip[] = [
  {
    id: "command-palette",
    title: "Command palette",
    blurb:
      "⌘K opens every action. Switch connections, run queries, jump to tables.",
    category: "editor",
    media: { kind: "video", file: "command-palette", width: 1280, height: 800 },
  },
  {
    id: "watch-mode",
    title: "Watch Mode",
    blurb:
      "Pin a SELECT, see it move. Re-runs on a cadence with live cell-level diff highlights.",
    category: "performance",
    media: { kind: "video", file: "watch-mode", width: 1280, height: 800 },
  },
  {
    id: "query-plans",
    title: "Query plans",
    blurb: "EXPLAIN ANALYZE rendered as a tree, not a wall of text.",
    category: "performance",
    media: { kind: "video", file: "query-plans", width: 1280, height: 800 },
  },
  {
    id: "er-diagram",
    title: "ER diagrams",
    blurb:
      "Interactive schema map. Filter to a table and see its graph of relationships.",
    category: "data",
    media: { kind: "video", file: "er-diagram", width: 1280, height: 800 },
  },
  {
    id: "data-masking",
    title: "Data masking",
    blurb:
      "Blur sensitive columns for demos and screenshots. Regex-based auto rules.",
    category: "data",
    media: { kind: "video", file: "data-masking", width: 1280, height: 800 },
  },
  {
    id: "inline-editing",
    title: "Inline editing",
    blurb: "Click a cell, change the value, preview the SQL, commit or undo.",
    category: "editor",
    media: { kind: "video", file: "inline-editing", width: 1280, height: 800 },
  },
  {
    id: "health-monitor",
    title: "Health monitor",
    blurb:
      "Active queries, cache hit ratios, locks, table sizes. Kill a stuck query live.",
    category: "performance",
    media: { kind: "video", file: "health-monitor", width: 1280, height: 800 },
  },
  {
    id: "column-stats",
    title: "Column statistics",
    blurb:
      "One click profiles a column — min, max, avg, null rate, histogram, top values.",
    category: "performance",
    media: { kind: "video", file: "column-stats", width: 1280, height: 800 },
  },
  {
    id: "mcp-approval",
    title: "MCP write approval",
    blurb:
      "An agent's write request stops at an in-app gate — nothing runs until you approve it.",
    category: "ai",
    media: { kind: "video", file: "mcp-approval", width: 1280, height: 800 },
  },
  {
    id: "ai-to-sql",
    title: "Plain-English to SQL",
    blurb:
      "Ask a question about your data, get back a runnable, schema-aware query.",
    category: "ai",
    media: { kind: "video", file: "ai-to-sql", width: 1280, height: 800 },
  },
  {
    id: "ssh-tunnels",
    title: "SSH tunnels",
    blurb:
      "Connect through a bastion with password or key auth. Tunnel lifetime tied to the connection.",
    category: "infra",
    media: { kind: "motion", component: "ssh-tunnel" },
  },
  {
    id: "local-credentials",
    title: "Credentials encrypted locally",
    blurb:
      "Stored with the OS keychain. We never see your passwords or API keys.",
    category: "infra",
    media: { kind: "motion", component: "local-vault" },
  },
  {
    id: "no-telemetry",
    title: "No telemetry",
    blurb:
      "Zero analytics, zero remote logging. Your queries never leave your machine.",
    category: "infra",
    media: { kind: "motion", component: "no-telemetry" },
  },
];

export function clipById(id: string): FeatureClip | undefined {
  return FEATURE_CLIPS.find((c) => c.id === id);
}

export function mp4Url(file: string): string {
  return `${CLIP_BASE}/${file}.mp4`;
}

export function webmUrl(file: string): string {
  return `${CLIP_BASE}/${file}.webm`;
}

export function posterUrl(file: string): string {
  return `/clips/${file}.webp`;
}
