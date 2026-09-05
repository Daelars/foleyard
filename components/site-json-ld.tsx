import { SITE_URL } from "@/lib/seo";

export function SiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Foleyard",
        url: SITE_URL,
        logo: `${SITE_URL}/app_preview.png`,
        sameAs: ["https://github.com/Daelars/foleyard-v1"],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: "Foleyard",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: "Foleyard",
        operatingSystem: "Windows, macOS, Linux",
        applicationCategory: "MultimediaApplication",
        description:
          "A local-first browser for messy SFX folders, music cues, and massive audio libraries.",
        url: SITE_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function ArticleJsonLd({
  title,
  description,
  slug,
  publishedAt,
  coverImage,
}: {
  title: string;
  description: string;
  slug: string;
  publishedAt: number;
  coverImage?: string | null;
}) {
  const url = `${SITE_URL}/blog/${slug}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    mainEntityOfPage: url,
    datePublished: new Date(publishedAt).toISOString(),
    author: { "@type": "Organization", name: "Foleyard", url: SITE_URL },
    publisher: { "@id": `${SITE_URL}/#organization` },
    ...(coverImage ? { image: [coverImage] } : {}),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
