/**
 * Intégration desktop (Tauri). Toutes les fonctions sont des no-ops
 * quand l'app tourne dans un simple navigateur, ce qui permet au même
 * code de servir la version GitHub Pages et la version Windows.
 */

export const isDesktop = "__TAURI_INTERNALS__" in window;

export async function initDesktop(onToggle: () => void) {
  if (!isDesktop) return;

  const { register } = await import("@tauri-apps/plugin-global-shortcut");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");

  const win = getCurrentWindow();
  await win.setAlwaysOnTop(true);

  await register("CommandOrControl+Shift+Space", async (event) => {
    if (event.state !== "Pressed") return;
    const visible = await win.isVisible();
    if (visible) {
      await win.hide();
    } else {
      await win.show();
      await win.setFocus();
      onToggle();
    }
  });
}

export async function hideWindow() {
  if (!isDesktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

export async function readClipboard(): Promise<string> {
  if (isDesktop) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return (await readText()) ?? "";
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}
