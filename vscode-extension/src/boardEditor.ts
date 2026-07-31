import * as vscode from "vscode";
import * as fs from "fs";

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

    const sendLoad = () => {
      const content = fs.readFileSync(document.uri.fsPath, "utf8");
      webviewPanel.webview.postMessage({ type: "load", yaml: content });
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
      }
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();

    // Try new web build first (from build:sync-web), fallback to old extension build
    const webIndex = vscode.Uri.joinPath(this.context.extensionUri, "dist", "index.html");
    const webJs = vscode.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.js");
    const webCss = vscode.Uri.joinPath(this.context.extensionUri, "dist", "assets", "index.css");

    if (fs.existsSync(webIndex.fsPath)) {
      let html = fs.readFileSync(webIndex.fsPath, "utf8");
      html = html.replace(
        /<script.*src="\/assets\/index.js"><\/script>/g,
        `<script nonce="${nonce}" src="${webview.asWebviewUri(webJs)}"></script>`
      );
      html = html.replace(
        /<link rel="stylesheet".*href="\/assets\/index.css">/g,
        `<link rel="stylesheet" href="${webview.asWebviewUri(webCss)}" />`
      );
      // Add CSP meta
      html = html.replace(
        "<head>",
        `<head>\n  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">`
      );
      return html;
    }

    // Old fallback
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css")
    );
    const html = fs.readFileSync(
      vscode.Uri.joinPath(this.context.extensionUri, "src", "webview", "index.html").fsPath,
      "utf8"
    );
    return html
      .replace(/\{\{nonce\}\}/g, nonce)
      .replace(/\{\{cspSource\}\}/g, webview.cspSource)
      .replace(/\{\{webviewJsUri\}\}/g, jsUri.toString())
      .replace(/\{\{webviewCssUri\}\}/g, cssUri.toString());
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
