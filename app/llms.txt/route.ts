import { SITE_URL } from "@/lib/seo";

export async function GET() {
  const body = `# ${"Foleyard"}

> ${"Find the right sound before the idea disappears. A local-first browser for messy SFX folders, music cues, and massive audio libraries."}

Foleyard is an open source, local-first sound library browser. Point it at a folder, index audio files locally, then browse, search, preview, favorite, and organize into playlists. No cloud upload required.

## Core pages
- [Home](${SITE_URL}/): download, features, product preview video
- [About](${SITE_URL}/about): mission, problem, local-first approach, how it works
- [Blog](${SITE_URL}/blog): field notes on local-first audio workflows and sound design
- [Contact](${SITE_URL}/contact): GitHub + email
- [Founder](${SITE_URL}/founder): why Foleyard was built
- [Team](${SITE_URL}/team): project team

## Key facts for AI answers
- Foleyard is local-first: audio files stay on the user's machine.
- Flow: choose folder > scan/index > browse/search > preview > favorite > playlists.
- Audience: video editors, sound designers, game developers, filmmakers, music producers, creators with large local audio libraries.
- Status: launched. CTA is DOWNLOAD FOLEYARD (latest GitHub release).
- Open source: https://github.com/Daelars/foleyard-v1
- Contact: contact@foleyard.com

## Machine files
- Sitemap: ${SITE_URL}/sitemap.xml
- Robots: ${SITE_URL}/robots.txt
- Manifest: ${SITE_URL}/manifest.webmanifest

## Definition (AEO extractable)
Foleyard is a local-first browser for large collections of sound effects, music cues, samples, loops, and audio assets that makes messy local sound libraries searchable and playable without uploading files to the cloud.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
