import { fetchSettings } from "./api";
import { cacheSettings } from "./appSettings";

/**
 * Warm the synchronous settings cache from the server once per app start.
 *
 * `openInEditor` and the composer's default agent read localStorage eagerly
 * (they cannot await), so without this they would only see the saved values
 * after the user opened the Settings pane at least once.
 */
export async function hydrateSettings(): Promise<void> {
  const stored = await fetchSettings();
  if (stored) cacheSettings(stored);
}
