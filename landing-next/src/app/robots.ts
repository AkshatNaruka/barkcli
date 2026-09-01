import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/_next/"],
      },
      {
        // Allow all AI search bots to cite content
        userAgent: [
          "GPTBot",           // OpenAI (ChatGPT search)
          "ChatGPT-User",     // OpenAI (ChatGPT user queries)
          "PerplexityBot",    // Perplexity AI
          "ClaudeBot",        // Anthropic (Claude)
          "anthropic-ai",     // Anthropic (alternative)
          "Google-Extended",  // Google Gemini / AI Overviews
          "Bingbot",          // Microsoft Copilot (via Bing)
          "YouBot",           // You.com
          "Amazonbot",        // Amazon Alexa
        ],
        allow: "/",
        disallow: ["/api/", "/admin/", "/_next/"],
      },
      {
        // Block training-only crawlers (not search/cite)
        userAgent: ["CCBot", "Bytespider", "GPTBot"],
        disallow: "/",
      },
    ],
    sitemap: "https://barkcli.vercel.app/sitemap.xml",
  };
}
