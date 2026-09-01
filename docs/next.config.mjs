import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

export default withMDX({
  output: "export",
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for esbuild type definitions
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    
    // Exclude esbuild types from processing
    config.module.rules.push({
      test: /\.d\.ts$/,
      include: /node_modules\/esbuild/,
      type: "asset/source",
    });
    
    return config;
  },
});
