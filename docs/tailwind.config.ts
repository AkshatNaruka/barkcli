import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/fumadocs-ui/dist/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 3.9%)",
        foreground: "hsl(0 0% 98%)",
        muted: "hsl(0 0% 63.9%)",
        "muted-foreground": "hsl(0 0% 45.1%)",
        border: "hsl(0 0% 14.9%)",
        primary: {
          DEFAULT: "hsl(0 0% 98%)",
          foreground: "hsl(0 0% 9%)",
        },
        secondary: {
          DEFAULT: "hsl(0 0% 14.9%)",
          foreground: "hsl(0 0% 98%)",
        },
        accent: {
          DEFAULT: "hsl(28 60% 50%)",
          foreground: "hsl(0 0% 100%)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
