/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists in secure contexts (HTTPS or localhost),
 * so a LAN URL over http:// throws on access. Fall back to a hidden textarea
 * and report whether it worked, so the caller can tell the user honestly.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or transient failure — try the legacy path.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    return copied;
  } catch {
    return false;
  }
}
