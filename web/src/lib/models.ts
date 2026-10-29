const PREFIX = "bark:model:";

/** Remember the last model a person chose for a provider. */
export function preferredModel(provider: string): string {
  try {
    return window.localStorage.getItem(`${PREFIX}${provider}`) || "";
  } catch {
    return "";
  }
}

export function rememberModel(provider: string, model: string): void {
  try {
    if (model) window.localStorage.setItem(`${PREFIX}${provider}`, model);
    else window.localStorage.removeItem(`${PREFIX}${provider}`);
  } catch {
    /* storage is optional */
  }
}
