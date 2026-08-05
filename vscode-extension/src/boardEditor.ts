import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export class BoardEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")],
    };

    webviewPanel.webview.html = this.getHtml(webviewPanel.webview);

    const boardName = path.basename(document.uri.fsPath, ".board");
    const projectRoot = path.dirname(document.uri.fsPath);

    const sendLoad = () => {
      const content = fs.readFileSync(document.uri.fsPath, "utf8");
      webviewPanel.webview.postMessage({ type: "load", yaml: content, boardName, projectRoot });
    };

    const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString()) {
        sendLoad();
      }
    });

    webviewPanel.onDidDispose(() => changeListener.dispose());

    webviewPanel.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case "ready":
          sendLoad();
          break;
        case "save": {
          const edit = new vscode.WorkspaceEdit();
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
          );
          edit.replace(document.uri, fullRange, message.yaml);
          vscode.workspace.applyEdit(edit);
          break;
        }
        case "getGitInfo": {
          try {
            const branch = execSync("git branch --show-current", { cwd: projectRoot, encoding: "utf8" }).trim();
            const lastCommit = execSync('git log -1 --format="%h %s (%an, %ar)"', { cwd: projectRoot, encoding: "utf8" }).trim();
            const authors = execSync('git log --format="%an" --all | sort -u', { cwd: projectRoot, encoding: "utf8", shell: "/bin/bash" }).trim().split("\n").filter(Boolean);
            webviewPanel.webview.postMessage({ type: "gitInfo", branch, lastCommit, authors });
          } catch {
            webviewPanel.webview.postMessage({ type: "gitInfo", branch: "?", lastCommit: "?", authors: [] });
          }
          break;
        }
        case "getCardHistory": {
          const historyPath = path.join(projectRoot, ".board", "history", boardName + ".log");
          if (!fs.existsSync(historyPath)) {
            webviewPanel.webview.postMessage({ type: "cardHistory", cardId: message.cardId, entries: [] });
            return;
          }
          const raw = fs.readFileSync(historyPath, "utf8");
          const entries = raw.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((e: any) => e && e.card === message.cardId);
          webviewPanel.webview.postMessage({ type: "cardHistory", cardId: message.cardId, entries });
          break;
        }
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.css")
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link rel="stylesheet" href="${cssUri}" />
  <title>Board</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 64; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
