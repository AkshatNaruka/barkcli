import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
      {
        userAgent: ["GPTBot", "Claude-Bot", "CCBot"],
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://barkcli.vercel.app/sitemap.xml",
  };
}
