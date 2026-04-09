type TelegramWebApp = {
  version?: string;
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
};

function parseVersion(version?: string): number[] {
  return (version || "")
    .split(".")
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
}

export function isTelegramVersionAtLeast(tg: TelegramWebApp, minVersion: string): boolean {
  if (typeof tg.isVersionAtLeast === "function") {
    try {
      return tg.isVersionAtLeast(minVersion);
    } catch {
      return false;
    }
  }

  const cur = parseVersion(tg.version);
  const min = parseVersion(minVersion);
  const len = Math.max(cur.length, min.length);

  for (let i = 0; i < len; i += 1) {
    const a = cur[i] ?? 0;
    const b = min[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

export function setupTelegramViewport(tg: TelegramWebApp | undefined): void {
  if (!tg) return;

  tg.ready?.();
  tg.expand?.();

  // requestFullscreen is supported only in newer Telegram clients.
  if (
    typeof tg.requestFullscreen === "function"
    && isTelegramVersionAtLeast(tg, "8.0")
  ) {
    try { tg.requestFullscreen(); } catch {}
  }

  // disableVerticalSwipes is also unsupported in older clients.
  if (
    typeof tg.disableVerticalSwipes === "function"
    && isTelegramVersionAtLeast(tg, "7.7")
  ) {
    try { tg.disableVerticalSwipes(); } catch {}
  }
}
