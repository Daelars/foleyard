# Foleyard

Foleyard is a local-first browser for messy SFX folders, music cues, and large
audio libraries. This repository is the **marketing site**: the landing page,
waitlist and download signup, the blog, the CMS-backed pages, and the admin
panels that drive them. The desktop app itself lives elsewhere — download links
point at GitHub releases of [`Daelars/foleyard-v2`](https://github.com/Daelars/foleyard-v2).

## Stack

| Layer     | Choice                                                              |
| --------- | ------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, React Compiler), React 19, TypeScript        |
| Styling   | Tailwind CSS v4 with the typography plugin                           |
| Backend   | Convex — database, queries/mutations, HTTP endpoints, cron jobs      |
| Auth      | Clerk — sign-in plus a `role` claim that gates admin pages           |
| Email     | Resend — waitlist thank-you, download link, one-time launch email    |
| Analytics | PostHog — browser events proxied through `/fy-ingest`, server events |
| Hosting   | Vercel for the Next.js app, Convex Cloud for the backend             |

`bun` is used for installs and scripts (`bun.lock`); `package-lock.json` is also
present, but only one package manager should be used at a time.

## How the pieces fit

```mermaid
flowchart LR
  V[Visitor browser] --> N[Next.js on Vercel]
  N -->|server render: fetchQuery| C[Convex deployment]
  V -->|live queries and mutations| C
  N -->|signup routes, client IP forwarded| C
  C --> DB[(Convex database)]
  C --> R[Resend]
  C -->|email delivery state| DB
  N --> K[Clerk]
  V --> K
  V -->|/fy-ingest rewrite| P[PostHog]
  N -->|server events| P
```

- **Server-rendered pages** (`app/blog`, `app/blog/[slug]`, `app/about`, …) read
  Convex with `fetchQuery` from `convex/nextjs` and render on the server.
- **Client components** that need live data (`components/waitlist-form.tsx`,
  the admin clients) use `ConvexProviderWithClerk`, so queries update in real
  time and admin mutations carry the Clerk token.
- **Public forms never call Convex directly.** The browser posts JSON to a Next
  route (`/api/waitlist`, `/api/download-signup`), which validates with Zod and
  forwards to the Convex HTTP endpoint at `NEXT_PUBLIC_CONVEX_SITE_URL`. The
  Next hop adds an `x-foleyard-client-ip` header so Convex rate limits apply per
  visitor instead of per Next.js server (`app/api/*/route.ts`,
  `convex/http.ts`).
- **Analytics** requests are rewritten from `/fy-ingest/*` to PostHog in
  `next.config.ts`, so the browser talks to the site's own origin.

### Convex tables

| Table               | Holds                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `waitlistSignups`   | pre-launch signups, email delivery state, hashed IP               |
| `downloadSignups`   | post-launch "email me the link" signups                           |
| `waitlistRateLimits`| per-IP and per-email rate limit counters, cleaned by a daily cron |
| `blogPosts`         | blog posts (markdown, slug, tags, cover image, published date)    |
| `sitePages`         | editable copy for about / founder / founders / team / contact      |
| `teamMembers`       | team list shown on `/team`                                        |
| `launchConfig`      | waitlist-vs-download switch and the one-time launch email flag    |
| `downloads`         | one row per clicked download, used for the admin counter          |

## Local setup

Prerequisites: [bun](https://bun.sh), Node 20+ (required by Next.js 16 — the repo
does not pin an engines field), a Convex account, a Clerk application, and (for
email) a Resend API key.

```bash
bun install
bunx convex dev   # terminal 1
bun run dev       # terminal 2
```

`bunx convex dev` logs into Convex, creates or selects a deployment, writes
`CONVEX_DEPLOYMENT` into `.env.local`, generates `convex/_generated`, and pushes
the schema and functions. Keep it running while you work; it redeploys on save.
The app is then on <http://localhost:3000>.

Scripts (`package.json`):

| Script          | Does                        |
| --------------- | --------------------------- |
| `bun run dev`   | `next dev` (Turbopack)      |
| `bun run build` | `next build`                |
| `bun run start` | `next start` after a build  |

There are no test, lint, or typecheck scripts; `npx tsc --noEmit` is the usual
type check.

## Environment variables

A `.env.example` template exists in the working tree, but the `.env*` rule in
`.gitignore` currently keeps it (and every other env file) out of git. Use the
table below as the list of record, and create `.env.local` for local work.

Variables marked **Vercel** are read by the Next.js app (build or server) and
belong in the Vercel project settings plus `.env.local`. Variables marked
**Convex** are read inside Convex functions and must be set on the deployment:

```bash
bunx convex env set RESEND_API_KEY re_...
bunx convex env list
```

| Variable                            | Set on         | Purpose                                                                                                       |
| ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOYMENT`                 | local CLI      | Which Convex deployment the CLI talks to. Written by `convex dev`; not needed on Vercel.                       |
| `NEXT_PUBLIC_CONVEX_URL`            | Vercel         | Deployment URL (`https://<deployment>.convex.cloud`) used by the browser Convex client and server renders.     |
| `NEXT_PUBLIC_CONVEX_SITE_URL`       | Vercel         | HTTP-actions URL (`https://<deployment>.convex.site`). The signup routes forward here; signup fails without it. |
| `NEXT_PUBLIC_SITE_URL`              | Vercel         | Canonical origin for metadata, sitemap, `robots.txt` and JSON-LD. Defaults to `https://foleyard.com`.          |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Vercel, Convex | PostHog project token for browser and server events. Analytics is skipped when it is missing.                 |
| `NEXT_PUBLIC_POSTHOG_HOST`          | Vercel         | PostHog API host used by the `/fy-ingest` rewrite and `ui_host`. Defaults to `https://us.i.posthog.com`.        |
| `NEXT_PUBLIC_POSTHOG_ASSETS_HOST`   | Vercel         | Optional. Assets host for the `/fy-ingest/static/*` rewrite. Defaults to `https://us-assets.i.posthog.com`.      |
| `POSTHOG_PROJECT_TOKEN`             | Vercel, Convex | Optional server-only override for the token; falls back to the `NEXT_PUBLIC_` value.                           |
| `POSTHOG_HOST`                      | Vercel, Convex | Optional server-only override for the PostHog host.                                                            |
| `RESEND_API_KEY`                    | Convex         | Sends every transactional email. Without it, sends are recorded as `failed` with a clear error.               |
| `RESEND_FROM_EMAIL`                 | Convex         | `From` address for all mail. Defaults to `hello@foleyard.com`; the domain must be verified in Resend.          |
| `WAITLIST_IP_HASH_SALT`             | Convex         | Salt for the SHA-256 hash of visitor IPs. Falls back to `CONVEX_DEPLOYMENT`, then to a constant — set it.      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel         | Clerk publishable key, required by `ClerkProvider`. Not in `.env.example`, but the app needs it.               |
| `CLERK_SECRET_KEY`                  | Vercel         | Clerk secret key, required by `clerkMiddleware` in `proxy.ts`.                                                 |
| `CLERK_JWT_ISSUER_DOMAIN`           | Convex         | Issuer domain of the Clerk JWT template that Convex validates (`convex/auth.config.ts`).                       |

Rotating `WAITLIST_IP_HASH_SALT` changes every stored IP hash, so old and new
rate-limit records no longer match. Treat it as a long-lived secret.

## Signup and email flow

The landing page (`app/page.tsx`) renders `WaitlistForm`, which reads
`launch.get` from Convex:

1. **Before launch** it shows the waitlist form. Submitting posts
   `{ email, source, website }` to `/api/waitlist`. The Next route validates it,
   forwards it to Convex, and Convex:
   - drops the submission silently if the hidden `website` honeypot is filled,
   - applies rate limits (5 submissions per IP per 15 minutes, 2 per email per
     24 hours),
   - normalises the email, hashes the IP with `WAITLIST_IP_HASH_SALT`, and
     inserts `waitlistSignups` (or reuses the existing row for a duplicate),
   - schedules the Resend thank-you email and records `sent` / `failed` plus the
     provider id or error on the signup row.
2. **After launch** (`launchConfig.launched`) it shows the download panel
   instead: a button that records a download in `downloads` and opens the latest
   GitHub release (via `/api/latest-release`, which falls back to the releases
   page), plus an optional "email me the link" form that follows the same path
   through `/api/download-signup` into `downloadSignups`.

Emails are sent from Convex actions in `convex/waitlistEmail.ts`,
`convex/downloadEmail.ts`, and `convex/launchEmail.ts`. All of them no-op
gracefully when `RESEND_API_KEY` is missing.

## Admin

| Route          | Manages                                                          |
| -------------- | ---------------------------------------------------------------- |
| `/admin/site`  | Page copy for about / founder / founders / team / contact, and team members |
| `/admin/blog`  | Create, edit, and delete blog posts (markdown)                    |
| `/admin/launch`| Flip the site between waitlist and download mode, see download count, send the one-time launch email |

All three are `force-dynamic` server components. Signed-out visitors get a
Clerk sign-in prompt; signed-in users without the admin role get a 404.
Server-side mutations are guarded independently by `assertAdmin` in
`convex/lib/admin.ts`, which checks the Clerk identity claims for
`role: "admin"`.

**Granting admin:** in the Clerk dashboard, open the user and set public
metadata:

```json
{ "role": "admin" }
```

Then make sure the Clerk JWT template used by Convex (named `convex`) includes
that role in its claims, because the Convex check reads it from the JWT — the
public metadata alone is not enough there. `CLERK_JWT_ISSUER_DOMAIN` on the
Convex deployment must match that template, and its audience should be `convex`
(see `BLOG.md` and `convex/auth.config.ts`). `BLOG.md` also documents enabling
Google OAuth and email one-time codes in Clerk.

## Blog and CMS content

- Posts live in `blogPosts`; markdown is rendered on the server by
  `lib/markdown.ts`, which drops raw HTML and strips `javascript:` / `data:`
  links and image sources before output.
- Cover images and inline images are served from `public/blog-images/` and
  referenced as `/blog-images/<file>.png`. `BLOG.md` covers the post schema and
  editing flow.
- Page copy for the static marketing pages lives in `sitePages`, with fallback
  copy in `lib/site-defaults.ts`. `/admin/site` can seed the defaults.

## Deploys

- The Next.js app deploys to Vercel from this repository. Configure the Vercel
  environment variables above for the Production (and Preview, if wanted)
  environments.
- The Convex backend is deployed separately: `bunx convex deploy` pushes the
  schema and functions to the production deployment. This repository contains
  no `vercel.json` and no build hook that runs that command, so the backend push
  is a manual step. `BLOG.md` describes the same split (`bunx convex dev --once`
  for schema, `bun run build` for the frontend).
- If the site and the backend are deployed independently, push the backend
  first when a change touches `convex/schema.ts`.

## Repository layout

```
app/                 routes: landing, blog, marketing pages, admin, API routes
components/          UI and client components (forms, admin clients, navbar)
convex/              schema, queries/mutations, HTTP endpoints, cron, emails
convex/_generated/   generated by `convex dev` — do not edit
lib/                 shared schemas (Zod), markdown renderer, SEO, admin checks
public/              static assets, including blog images
proxy.ts             Clerk middleware
next.config.ts       React Compiler, Turbopack root, PostHog rewrites
BLOG.md              blog + CMS notes
```

## Conventions

Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, …). Keep the
generated Convex files out of hand edits and run `npx tsc --noEmit` before
opening a PR.
