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
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.js")
    );
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview.css")
    );
    const nonce = getNonce();

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
