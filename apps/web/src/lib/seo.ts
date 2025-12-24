import type { Metadata } from "next";

export const SITE_CONFIG = {
  name: "data-peek",
  title: "data-peek | Fast PostgreSQL Client for Developers",
  description:
    "A lightning-fast, beautiful PostgreSQL desktop client. Query, explore, and edit your data with a keyboard-first experience. No bloat, no subscriptions.",
  url: "https://www.datapeek.dev",
  ogImage: "https://www.datapeek.dev/og-image.png",
  twitterHandle: "@gillarohith",
  author: "Rohith Gilla",
} as const;

export interface PageMetadata {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noindex?: boolean;
  ogImage?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  tags?: string[];
}

export function generateMetadata({
  title,
  description,
  path = "",
  keywords = [],
  noindex = false,
  ogImage,
  type = "website",
  publishedTime,
  modifiedTime,
  authors,
  tags,
}: PageMetadata): Metadata {
  const fullTitle = path ? `${title} | ${SITE_CONFIG.name}` : title;
  const url = `${SITE_CONFIG.url}${path}`;
  const image = ogImage || SITE_CONFIG.ogImage;

  const metadata: Metadata = {
    title: fullTitle,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    authors: authors
      ? authors.map((name) => ({ name }))
      : [{ name: SITE_CONFIG.author }],
    creator: SITE_CONFIG.author,
    publisher: SITE_CONFIG.name,
    robots: noindex ? "noindex,nofollow" : "index,follow",
    openGraph: {
      type,
      title: fullTitle,
      description,
      url,
      siteName: SITE_CONFIG.name,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      ...(publishedTime && { publishedTime }),
      ...(modifiedTime && { modifiedTime }),
      ...(authors && { authors }),
      ...(tags && { tags }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      creator: SITE_CONFIG.twitterHandle,
      images: [image],
    },
    alternates: {
      canonical: url,
    },
  };

  return metadata;
}

export function generateStructuredData(
  type: "Organization" | "SoftwareApplication" | "Article",
  data: Record<string, unknown>
) {
  const base = {
    "@context": "https://schema.org",
    "@type": type,
  };

  return {
    ...base,
    ...data,
  };
}

export function getOrganizationStructuredData() {
  return generateStructuredData("Organization", {
    name: SITE_CONFIG.name,
    url: SITE_CONFIG.url,
    logo: `${SITE_CONFIG.url}/logo.png`,
    description: SITE_CONFIG.description,
    sameAs: [
      "https://github.com/Rohithgilla12/data-peek",
      "https://x.com/gillarohith",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      email: "hello@datapeek.dev",
      contactType: "Customer Support",
    },
  });
}

export function getSoftwareApplicationStructuredData() {
  return generateStructuredData("SoftwareApplication", {
    name: SITE_CONFIG.name,
    applicationCategory: "DeveloperApplication",
    operatingSystem: ["macOS", "Windows", "Linux"],
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
    },
    description: SITE_CONFIG.description,
    url: SITE_CONFIG.url,
    downloadUrl: `${SITE_CONFIG.url}/download`,
  });
}

export function getArticleStructuredData({
  title,
  description,
  publishedTime,
  modifiedTime,
  author,
  image,
  url,
}: {
  title: string;
  description: string;
  publishedTime: string;
  modifiedTime?: string;
  author: string;
  image?: string;
  url: string;
}) {
  return generateStructuredData("Article", {
    headline: title,
    description,
    image: image || SITE_CONFIG.ogImage,
    datePublished: publishedTime,
    ...(modifiedTime && { dateModified: modifiedTime }),
    author: {
      "@type": "Person",
      name: author,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_CONFIG.name,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_CONFIG.url}/logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  });
}

export function getBreadcrumbStructuredData(
  items: Array<{ name: string; url: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function getFAQStructuredData(
  faqs: Array<{ question: string; answer: string }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
