#!/usr/bin/env node

/**
 * Generate command documentation from barkcli --help output.
 * 
 * Usage: node scripts/gen-cli-docs.mjs
 * 
 * This script:
 * 1. Runs `cargo run --bin gen-docs` to generate markdown from clap
 * 2. Splits the output into individual command pages
 * 3. Writes them to content/docs/commands/
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const COMMANDS_DIR = join(ROOT, "content", "docs", "commands");

// Ensure commands directory exists
if (!existsSync(COMMANDS_DIR)) {
  mkdirSync(COMMANDS_DIR, { recursive: true });
}

console.log("Generating CLI documentation...");

let markdown;
try {
  // Run the gen-docs binary from the workspace root
  markdown = execSync("cargo run --bin gen-docs --manifest-path ../barkcli-cli/Cargo.toml 2>/dev/null", {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 120000,
  });
} catch (err) {
  console.error("Failed to run gen-docs binary. Make sure Rust is installed.");
  console.error(err.message);
  process.exit(1);
}

// Parse the markdown output into sections
const lines = markdown.split("\n");
let currentCommand = null;
let currentContent = [];
const commands = {};

for (const line of lines) {
  // Match command headers (## `command`)
  const match = line.match(/^## `(barkcli\s+\S+)`/);
  if (match) {
    if (currentCommand) {
      commands[currentCommand] = currentContent.join("\n");
    }
    currentCommand = match[1].replace("barkcli ", "").trim();
    currentContent = [`---\ntitle: ${currentCommand}\ndescription: CLI command reference for barkcli ${currentCommand}\n---\n\n# barkcli ${currentCommand}\n`];
  } else if (currentCommand) {
    currentContent.push(line);
  }
}

// Don't forget the last command
if (currentCommand) {
  commands[currentCommand] = currentContent.join("\n");
}

// Write each command to its own file
let count = 0;
for (const [name, content] of Object.entries(commands)) {
  // Sanitize filename
  const filename = name.replace(/\s+/g, "-").replace(/[()]/g, "").toLowerCase();
  const filepath = join(COMMANDS_DIR, `${filename}.mdx`);
  writeFileSync(filepath, content);
  count++;
  console.log(`  Written: commands/${filename}.mdx`);
}

console.log(`\nGenerated ${count} command documentation pages.`);
console.log(`Output directory: ${COMMANDS_DIR}`);
