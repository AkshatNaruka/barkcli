import * as vscode from "vscode";
import { BoardEditorProvider } from "./boardEditor";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "barkcli.boardEditor",
      new BoardEditorProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}
