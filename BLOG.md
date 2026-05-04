# Blog Documentation

## Overview
The Foleyard blog is built with Convex as the backend and Next.js App Router for the frontend. Posts are stored in Convex and rendered server-side.

## Architecture
- **Storage**: Convex `blogPosts` table
- **Frontend**: Next.js App Router (`/blog`, `/blog/[slug]`)
- **Admin**: Protected page at `/admin/blog` using Clerk admin role auth
- **Rendering**: Markdown → HTML via `marked` at request time (SSR)

## Blog Post Schema
| Field | Type | Description |
|-------|------|-------------|
| title | string | Post title |
| slug | string | URL slug (e.g., "my-post") |
| content | string | Full markdown content |
| excerpt | string | Short summary for blog index |
| tags | string[] | Array of tag strings |
| coverImage | string \| null | Cover image URL or path |
| publishedAt | number | Unix timestamp |

## Usage

### Creating Posts
1. Navigate to `/admin/blog`
2. Sign in with Clerk
3. Fill in the form (title, slug, excerpt, content in markdown, tags, cover image)
4. Click "Create Post"

### Editing/Deleting Posts
- Use the admin page to edit or delete existing posts

### Clerk admin setup
Add to `.env.local` and Vercel:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
CLERK_JWT_ISSUER_DOMAIN=https://your-clerk-domain.clerk.accounts.dev
```

In the Clerk dashboard:

1. Enable Google OAuth and email one-time codes.
2. Sign in once with your account.
3. Open your user in Clerk and set public metadata:

```json
{ "role": "admin" }
```

For Convex-authenticated blog mutations, create a Clerk JWT template named `convex` with audience `convex`, and include the admin role in the token claims. Then set `CLERK_JWT_ISSUER_DOMAIN` in Convex environment variables.

### Images
- Store images in `public/blog-images/`
- Reference in markdown as: `![Alt text](/blog-images/image.png)`

## Deployment
- Convex schema deployed via `bunx convex dev --once`
- Frontend builds with `bun run build`
- Blog pages are server-rendered (SSR) for fresh content

## Routes
- `/blog` - Blog index (lists all posts, newest first)
- `/blog/[slug]` - Individual blog post
- `/admin/blog` - Admin UI (Clerk protected)
