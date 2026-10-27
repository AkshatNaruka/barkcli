import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { parseUnifiedDiff, UnifiedDiff } from "./UnifiedDiff";

const DIFF = `diff --git a/src/api.ts b/src/api.ts
index 1111111..2222222 100644
--- a/src/api.ts
+++ b/src/api.ts
@@ -4,3 +4,4 @@ export function request() {
   const base = "/api";
-  return fetch(base);
+  const token = readToken();
+  return fetch(base, { headers: { authorization: token } });
 }
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const ready = true;
+export const count = 2;
`;

describe("parseUnifiedDiff", () => {
  it("parses files, hunks, line numbers, and additions/deletions", () => {
    const files = parseUnifiedDiff(DIFF);

    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("src/api.ts");
    expect(files[0].additions).toBe(2);
    expect(files[0].deletions).toBe(1);
    expect(files[0].hunks[0].oldStart).toBe(4);
    expect(files[0].hunks[0].newStart).toBe(4);
    expect(files[0].hunks[0].lines.map((line) => line.kind)).toContain("add");
    expect(files[1].path).toBe("src/new.ts");
    expect(files[1].additions).toBe(2);
  });

  it("tolerates a bare ---/+++ diff and empty input", () => {
    const bare = parseUnifiedDiff("--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new\n");
    expect(bare[0].path).toBe("file.txt");
    expect(bare[0].additions).toBe(1);
    expect(bare[0].deletions).toBe(1);
    expect(parseUnifiedDiff("")).toEqual([]);
  });
});

describe("UnifiedDiff", () => {
  it("renders file headers, counts, and changed lines", () => {
    render(<UnifiedDiff diff={DIFF} />);

    expect(screen.getByLabelText("Unified diff")).toBeInTheDocument();
    expect(screen.getByText("src/api.ts")).toBeInTheDocument();
    expect(screen.getByText("src/new.ts")).toBeInTheDocument();
    expect(screen.getAllByText("+2")).toHaveLength(2);
    expect(screen.getByText("−1")).toBeInTheDocument();
    expect(screen.getByText("const token = readToken();")).toBeInTheDocument();
    expect(screen.getAllByText("+")).toHaveLength(4);
  });

  it("shows the empty label and a raw fallback for non-git text", () => {
    const { rerender } = render(<UnifiedDiff diff="" emptyLabel="Nothing to show." />);
    expect(screen.getByText("Nothing to show.")).toBeInTheDocument();

    rerender(<UnifiedDiff diff="not a git diff" />);
    expect(screen.getByText("not a git diff")).toBeInTheDocument();
  });
});
