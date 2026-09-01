import Link from "next/link";

export default function VSCodePage() {
  return (
    <>
      <div className="mb-6 text-sm text-white/50">
        <Link href="/" className="hover:text-white transition-colors">barkcli</Link>
        <span className="mx-2">/</span>
        <Link href="/docs/interfaces" className="hover:text-white transition-colors">Interfaces</Link>
        <span className="mx-2">/</span>
        <span className="text-white/80">VS Code</span>
      </div>

      <h1 className="mb-4 text-4xl font-bold tracking-tight">VS Code Extension</h1>
      <p className="mb-8 text-lg text-white/60">
        Visual editor for .board files with drag-and-drop kanban.
      </p>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Install</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# Via VS Code Extensions
Search for "barkcli" in the Extensions panel

# Via CLI
barkcli vscode-install`}</code></pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Features</h2>
        <ul className="list-inside list-disc space-y-2 text-white/60">
          <li>Custom editor for .board files</li>
          <li>Drag-and-drop kanban board</li>
          <li>Inline card editing</li>
          <li>Board file syntax highlighting</li>
          <li>Integrated with VS Code file explorer</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Usage</h2>
        <ol className="list-decimal list-inside space-y-2 text-white/60">
          <li>Open a .board file in VS Code</li>
          <li>Click &quot;Open with barkcli&quot; in the editor title bar</li>
          <li>Use the visual kanban interface</li>
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">How It Works</h2>
        <p className="text-white/60">
          The extension loads the same web app as a VS Code webview. All board operations use the same APIs.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-2xl font-bold">Development</h2>
        <pre className="rounded-lg bg-white/5 border border-white/10 p-4 text-sm font-mono text-white/80 overflow-x-auto"><code>{`# Build the extension
cd vscode-extension
npm install
npm run build

# Package VSIX
npx @vscode/vsce package

# Install locally
code --install-extension barkcli-vscode-0.1.0.vsix`}</code></pre>
      </section>
    </>
  );
}
