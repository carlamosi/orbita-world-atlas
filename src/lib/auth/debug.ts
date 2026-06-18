type AuthDebugDetails = Record<string, unknown>;

function authDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return import.meta.env.DEV || window.localStorage.getItem("orbita-auth-debug") === "1";
  } catch {
    return import.meta.env.DEV;
  }
}

export function authDebug(event: string, details: AuthDebugDetails = {}) {
  if (!authDebugEnabled()) return;
  const safeDetails = Object.fromEntries(
    Object.entries(details).filter(([key]) => !/token|secret|key|password/i.test(key)),
  );
  console.debug(`[ORBITA auth] ${event}`, safeDetails);
}