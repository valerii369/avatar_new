"use client";
import { useState, useEffect } from "react";

/**
 * Returns the top padding needed to avoid TMA header overlap in fullscreen mode.
 * Uses Telegram WebApp's safeAreaInset + contentSafeAreaInset.
 * Falls back to 0 outside of Telegram.
 */
export function useTmaSafeArea(): number {
  const [topInset, setTopInset] = useState(0);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;

    const update = () => {
      const safeArea = tg.safeAreaInset || { top: 0 };
      const contentSafeArea = tg.contentSafeAreaInset || { top: 0 };
      let top = (safeArea.top || 0) + (contentSafeArea.top || 0);
      // Fullscreen mode — TG header buttons are ~44px from top on most devices
      if (top === 0 && tg.isFullscreen) {
        top = 44;
      }
      setTopInset(top);
    };

    update();

    // Listen for viewport changes (fullscreen toggle, rotation, etc.)
    tg.onEvent?.("viewportChanged", update);
    tg.onEvent?.("safeAreaChanged", update);
    tg.onEvent?.("contentSafeAreaChanged", update);

    return () => {
      tg.offEvent?.("viewportChanged", update);
      tg.offEvent?.("safeAreaChanged", update);
      tg.offEvent?.("contentSafeAreaChanged", update);
    };
  }, []);

  return topInset;
}
