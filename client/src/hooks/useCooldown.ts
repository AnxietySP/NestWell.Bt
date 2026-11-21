import { useCallback, useEffect, useState } from 'react';

const key = (scope: string) => `nw_cooldown_until:${scope.toLowerCase()}`;

function remainingSeconds(scope: string): number {
  try {
    const until = Number(sessionStorage.getItem(key(scope)) || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}

/** Persist a cooldown for a scope (e.g. an email) so it survives page reloads and navigation. */
export function startCooldown(scope: string, seconds: number) {
  try {
    sessionStorage.setItem(key(scope), String(Date.now() + seconds * 1000));
  } catch {
    /* storage unavailable: cooldown simply won't persist */
  }
}

/** Counts down from the stored deadline; computing from Date.now() keeps it accurate in throttled background tabs. */
export function useCooldown(scope: string) {
  const [seconds, setSeconds] = useState(() => remainingSeconds(scope));

  useEffect(() => {
    setSeconds(remainingSeconds(scope));
    const id = window.setInterval(() => setSeconds(remainingSeconds(scope)), 1000);
    return () => window.clearInterval(id);
  }, [scope]);

  const start = useCallback(
    (s: number) => {
      startCooldown(scope, s);
      setSeconds(remainingSeconds(scope));
    },
    [scope]
  );

  return { seconds, start };
}

export const formatCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
