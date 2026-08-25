import type { Metadata } from "next";

const SITE_URL = "https://barkcli.vercel.app";

export function generatePageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  const ogImage = image || `${SITE_URL}/og${path}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "barkcli",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export function generateJsonLd(data: Record<string, unknown>) {
  return {
    __html: JSON.stringify({
      "@context": "https://schema.org",
      ...data,
    }),
  };
}

export function softwareApplicationJsonLd() {
  return generateJsonLd({
    "@type": "SoftwareApplication",
    name: "barkcli",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Linux, Windows",
    url: SITE_URL,
    description:
      "Git-native kanban board that lives in your repo. CLI, terminal UI, and web app — one binary, no cloud.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    license: "https://github.com/AkshatNaruka/barkcli/blob/main/LICENSE",
    codeRepository: "https://github.com/AkshatNaruka/barkcli",
  });
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return generateJsonLd({
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  });
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return generateJsonLd({
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  });
}

export function howToJsonLd(steps: { name: string; text: string }[]) {
  return generateJsonLd({
    "@type": "HowTo",
    step: steps.map((step, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: step.name,
      text: step.text,
    })),
  });
}
