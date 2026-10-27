import * as Clipboard from "expo-clipboard";

/** Copies text; resolves false when it couldn't. */
export async function copyText(text: string): Promise<boolean> {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
}
