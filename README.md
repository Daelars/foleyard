# Foleyard

A local-first browser for messy SFX folders, music cues, and massive audio libraries.

## Main Landing Page.

## Development

The project uses [Bun](https://bun.sh) as its package manager. `bun.lock` is the
only lockfile: do not commit `package-lock.json`, `yarn.lock`, or
`pnpm-lock.yaml`.

```bash
bun install
bun run dev
```

### Checks

```bash
bun run check   # lint plus type-checking for the app and Convex functions
bun run lint
bun run typecheck
```

Every pull request runs lint, typecheck, and a production build in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).
