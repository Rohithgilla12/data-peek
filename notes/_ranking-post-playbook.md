# The Ranking-Post Playbook

_Internal author guide. Not a blog post — the `_` prefix and `.md` extension keep it out of the published set (`getBlogPosts()` only reads `.mdx`)._

## Why this exists

One post — `listen-notify-without-tears` — pulled ~433 visitors, and **~438 of them came from Google**, not Twitter or Reddit. That is not a launch spike that decays in a week. It is organic search ranking: durable, compounding traffic that keeps paying out every month.

This document reverse-engineers _why_ that post ranks and converts, so every future post is built the same way instead of by accident.

**The thesis, in one line:** _Write problem-first tutorials that target a real developer Google search, and let data-peek show up as the relief — never the subject._

## The anatomy of a ranking post

Every part below is lifted from the winner. Follow the skeleton in order.

### 1. Title = the search, phrased like a human

The winner's title is **"Debugging Postgres LISTEN/NOTIFY Is Finally Pleasant."** It contains the exact words a stuck developer types into Google — `postgres`, `listen/notify`, `debugging` — but reads like a person wrote it, not a keyword robot.

- Lead with the concrete technology and the verb of the pain (`debugging`, `killing`, `finding`, `fixing`).
- Put the searchable terms in the first half of the title.
- Earn the second half with voice ("Is Finally Pleasant"), not filler.

**Test:** would someone in the middle of this exact problem type these words into Google? If not, the title is wrong.

### 2. Open on visceral, specific pain — not on the product

The winner's first sentence:

> "I have written the same 40-line Node script to debug a Postgres `LISTEN` channel at least six times."

Then it _shows the throwaway solution the reader is currently using_ (the `listen.js` snippet) and narrates the misery of it — the connection dropping, the Ctrl+C, the re-run, the event already gone.

Rules for the hook:
- First person, specific number ("six times", "40-line"), real artefact (`listen.js`).
- Show the reader's **current** bad workflow before you show ours. They should think "yes, that is exactly what I do."
- data-peek is not mentioned until the pain is fully established. In the winner it first appears at the _end_ of the hook: "the version I wish I had had the first time."

### 3. Tool as relief, then real depth

Once the pain lands, introduce the data-peek feature as the fix — then **go deep with real code and real trade-offs.** The winner shows the actual reconnect loop, the SQLite schema, the identifier-quoting footgun, and a candid "What I'd do differently" section.

That depth is doing two jobs at once:
- **Dwell time + credibility.** Google rewards pages people actually read to the end. Honest engineering ("I lost a channel on every reconnect until I noticed") keeps them there.
- **It is genuinely useful** even to someone who never installs data-peek — which is exactly why it ranks.

Never write a post that only makes sense if you already use the product. The winner teaches Postgres LISTEN/NOTIFY; the tool is the vehicle.

### 4. Soft CTA at the very end

The winner closes with a single line — free for personal use, MIT source, "if you have ever rewritten the listen.js script, you will know exactly why this exists." The page-level CTA card ("Download Free / More Articles") is already rendered by the post template, so the body just needs one honest closing nudge, not a sales pitch.

### 5. Cross-link into the cluster

Every post should link to 2–3 sibling posts where it is genuinely relevant (see the winner's links to connection-health, EXPLAIN, and table-sizes). These are added contextually, mid-sentence — never a "related links" dump in the body. The **"Read next" grid and breadcrumb schema are automatic** (Play 1); your job is only the in-body contextual links.

## Frontmatter checklist

```yaml
---
title: "..."          # the search, phrased like a human (see §1)
description: "..."     # this IS the Google meta description — lead with the benefit, 150–160 chars
date: "YYYY-MM-DD"
author: "Rohith Gilla"
tags: ["postgres", ...] # lowercase; shared tags drive the "Read next" grid, so tag deliberately
published: true
---
```

- **`description`** is the snippet Google shows under the title. Write it for a human deciding whether to click, not for a crawler.
- **`tags`** are the cluster glue. `getRelatedPosts()` ranks siblings by shared-tag count, so a post tagged `["postgres", "performance"]` will surface next to other Postgres/performance posts. Tag with the cluster in mind.

## What the template already does for you (Play 1)

You do not need to hand-build any of this — it ships automatically on every post:

- **`Article` JSON-LD** — publish date, author, headline (was already present).
- **`BreadcrumbList` JSON-LD** — Home › Blog › Post, for breadcrumb rich results.
- **"Read next" grid** — three tag-ranked sibling posts at the foot of the article.
- **Sitemap entry, canonical URL, OpenGraph + Twitter cards** — via `sitemap.ts` and `lib/seo.ts`.

## Pre-publish checklist

- [ ] Title contains the real search phrase and reads like a human wrote it.
- [ ] First paragraph names a specific, visceral pain in first person.
- [ ] The reader's _current_ bad workflow is shown before data-peek appears.
- [ ] At least one block of real code and one honest trade-off / "what I'd do differently".
- [ ] The post is useful even to someone who never installs data-peek.
- [ ] 2–3 contextual in-body links to sibling posts.
- [ ] `description` is a click-worthy 150–160-char meta description.
- [ ] `tags` are lowercase and chosen to sit the post inside a cluster.
- [ ] One soft closing line — no hard sell.

## Anti-patterns (why release notes do not rank)

Posts like `watch-mode` or `sweat-the-details` serve people who already follow data-peek. They are worth writing for that audience — but they do **not** rank on search, because:

- The title describes a _feature name_, not a _search_ ("Watch Mode" is not something a stranger Googles).
- They assume the reader already cares about data-peek.
- There is no external pain being solved for someone who has never heard of us.

Keep writing them for your existing audience — just don't expect them to be the SEO engine. The engine is the problem-first tutorial.

## An honest note on measurement

We can see _which_ posts win in analytics, and we can research _which searches exist_ and how much competition they have. What we do **not** have is a keyword search-volume API — so the topic backlog (Play 3) prioritises by search intent and competition, not by hard monthly-search-volume numbers. Treat the ranking as a strong hypothesis to validate by shipping, not as a guaranteed traffic forecast.
