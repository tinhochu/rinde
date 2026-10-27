/**
 * Copies text in the browser. Called straight from the tap: Safari only allows clipboard writes that
 * start inside the user gesture, so the write begins synchronously; a hidden textarea is the fallback
 * for browsers without the async clipboard (or that refuse it).
 */
export function copyText(text: string): Promise<boolean> {
  const fallback = () => {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  };
  if (!navigator.clipboard?.writeText) return Promise.resolve(fallback());
  return navigator.clipboard.writeText(text).then(() => true, fallback);
}
