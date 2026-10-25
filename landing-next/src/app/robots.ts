import type { MetadataRoute } from "next";

// Required for `output: "export"` (GitHub Pages) — the route is static either way.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/_next/"],
      },
      {
        // Search-and-citation AI crawlers: allow (they can cite you).
        userAgent: [
          "GPTBot", // OpenAI / ChatGPT search
          "OAI-SearchBot", // OpenAI search indexing
          "ChatGPT-User", // OpenAI (user-triggered fetch)
          "PerplexityBot", // Perplexity AI
          "ClaudeBot", // Anthropic (Claude)
          "anthropic-ai", // Anthropic (alternative)
          "Google-Extended", // Google Gemini / AI Overviews
          "Google-CloudVertexBot", // Vertex AI agents
          "Bingbot", // Microsoft Copilot (via Bing)
          "cohere-ai", // Cohere
          "YouBot", // You.com
          "Amazonbot", // Amazon Alexa / Rufus
        ],
        allow: "/",
        disallow: ["/api/", "/admin/", "/_next/"],
      },
      {
        // Training-only crawlers (allow content but they are not blocked from citations since
        // they don't power search/citation features; they are listed only to be explicit).
        userAgent: ["CCBot", "Bytespider"],
        allow: "/",
        disallow: ["/api/", "/admin/", "/_next/"],
      },
    ],
    sitemap: [
      "https://akshatnaruka.github.io/barkcli/sitemap.xml",
      "https://akshatnaruka.github.io/barkcli/llms.txt",
    ],
    host: "https://akshatnaruka.github.io/barkcli",
  };
}
