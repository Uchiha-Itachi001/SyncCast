import { useEffect, useRef } from 'react';

/**
 * Hook to request Screen Wake Lock so mobile devices don't sleep
 * and throttle Web Audio or JS timer execution during music playback.
 */
export function useWakeLock(enabled = true) {
  const wakeLockRef = useRef(null);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let released = false;

    async function requestWakeLock() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn('Wake Lock request failed:', err.message);
      }
    }

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (!released && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [enabled]);
}
