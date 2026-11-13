import { SiteHeader } from "@/components/site/SiteHeader";
import { Hero } from "@/components/site/Hero";
import { AgentStrip } from "@/components/site/AgentStrip";
import { ScrollStory } from "@/components/site/ScrollStory";
import { ProductShowcase } from "@/components/site/ProductShowcase";
import { FeatureBento } from "@/components/site/FeatureBento";
import { TrustSection } from "@/components/site/TrustSection";
import { InterfacesSection } from "@/components/site/InterfacesSection";
import { InstallSection } from "@/components/site/InstallSection";
import { FaqSection, FAQ_ITEMS } from "@/components/site/FaqSection";
import { FinalCta } from "@/components/site/FinalCta";
import { Footer } from "@/components/Footer";

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-copper focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-ink"
      >
        Skip to content
      </a>

      <SiteHeader />

      <main id="main">
        <Hero />
        <AgentStrip />
        <ScrollStory />
        <ProductShowcase />
        <FeatureBento />
        <TrustSection />
        <InterfacesSection />
        <InstallSection />
        <FaqSection />
        <FinalCta />
      </main>

      <Footer />
    </>
  );
}
