import { kvGet, kvSet } from '../db/database';

const KEY = 'lasterror';
export type LastError = { text: string; at: number };

async function remember(text: string) {
  try {
    await kvSet(KEY, JSON.stringify({ text: text.slice(0, 600), at: Date.now() }));
  } catch {
    // nothing more can be done if storage is unavailable
  }
}

export async function getLastError(): Promise<LastError | null> {
  try {
    const raw = await kvGet(KEY);
    return raw ? (JSON.parse(raw) as LastError) : null;
  } catch {
    return null;
  }
}

export async function clearLastError() {
  try {
    await kvSet(KEY, '');
  } catch {
    // ignore
  }
}

/** Report an error from a component boundary. */
export const reportError = (e: unknown, where = 'screen') => remember(`${where}: ${(e as Error)?.message ?? String(e)}`);

/**
 * Last line of defence. Every uncaught JS error is recorded so it can be read on the More tab.
 * Errors that only mean "a video player was already released" (a late event from a card that was
 * swiped away) are ignored instead of closing the app; everything else goes to the normal handler.
 */
export function installCrashGuard() {
  const EU = (globalThis as unknown as {
    ErrorUtils?: {
      setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void;
      getGlobalHandler?(): (e: Error, fatal?: boolean) => void;
    };
  }).ErrorUtils;
  if (!EU?.setGlobalHandler) return;
  const previous = EU.getGlobalHandler?.();
  EU.setGlobalHandler((error, isFatal) => {
    const msg = String(error?.message ?? error);
    void remember(`${isFatal ? 'fatal' : 'error'}: ${msg}`);
    if (/already released|released|VideoPlayer|ExpoVideo|expo-video|PlayerItem|MediaCodec/i.test(msg)) {
      console.warn('[guard] ignored a late video error:', msg);
      return;
    }
    previous?.(error, isFatal);
  });
}
