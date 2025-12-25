import {
  getOrganizationStructuredData,
  getSoftwareApplicationStructuredData,
  getArticleStructuredData,
  getBreadcrumbStructuredData,
  getFAQStructuredData,
} from "@/lib/seo";

interface StructuredDataProps {
  type: "organization" | "software" | "article" | "breadcrumb" | "faq";
  data?: {
    article?: {
      title: string;
      description: string;
      publishedTime: string;
      modifiedTime?: string;
      author: string;
      image?: string;
      url: string;
    };
    breadcrumb?: Array<{ name: string; url: string }>;
    faq?: Array<{ question: string; answer: string }>;
  };
}

export function StructuredData({ type, data }: StructuredDataProps) {
  let structuredData: Record<string, unknown>;

  switch (type) {
    case "organization":
      structuredData = getOrganizationStructuredData();
      break;
    case "software":
      structuredData = getSoftwareApplicationStructuredData();
      break;
    case "article":
      if (!data?.article) {
        return null;
      }
      structuredData = getArticleStructuredData(data.article);
      break;
    case "breadcrumb":
      if (!data?.breadcrumb) {
        return null;
      }
      structuredData = getBreadcrumbStructuredData(data.breadcrumb);
      break;
    case "faq":
      if (!data?.faq) {
        return null;
      }
      structuredData = getFAQStructuredData(data.faq);
      break;
    default:
      return null;
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
