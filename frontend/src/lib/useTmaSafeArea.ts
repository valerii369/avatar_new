"use client";
import { useState, useEffect } from "react";

/**
 * Returns top safe area for TMA fullscreen.
 * Uses multiple strategies to get the right value:
 * 1. Telegram API (safeAreaInset + contentSafeAreaInset)
 * 2. CSS env(safe-area-inset-top) via DOM measurement
 * 3. Fixed fallback when inside Telegram
 */
export function useTmaSafeArea(): number {
  const [topInset, setTopInset] = useState(0);

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;

    // Strategy 1: measure CSS env(safe-area-inset-top) — always works on iOS
    const measureCssEnv = (): number => {
      const el = document.createElement("div");
      el.style.position = "fixed";
      el.style.top = "0";
      el.style.height = "env(safe-area-inset-top, 0px)";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
      const h = el.getBoundingClientRect().height;
      document.body.removeChild(el);
      return h;
    };

    const update = () => {
      let top = 0;

      // Try Telegram API first
      if (tg) {
        const sa = tg.safeAreaInset?.top || 0;
        const csa = tg.contentSafeAreaInset?.top || 0;
        top = sa + csa;
      }

      // If TG API returned 0, try CSS env
      if (top === 0) {
        top = measureCssEnv();
      }

      // Inside Telegram — always need space for TG header buttons (~44px)
      // CSS env gives only device safe area (status bar), not TG buttons
      if (tg && top > 0 && top < 80) {
        // We got device safe area but need to add TG header height
        top += 44;
      }

      // Final fallback: inside Telegram but got nothing — use fixed value
      if (tg && top === 0) {
        top = 90;
      }

      setTopInset(top);
    };

    update();

    if (tg) {
      tg.onEvent?.("viewportChanged", update);
      tg.onEvent?.("safeAreaChanged", update);
      tg.onEvent?.("contentSafeAreaChanged", update);
    }

    return () => {
      if (tg) {
        tg.offEvent?.("viewportChanged", update);
        tg.offEvent?.("safeAreaChanged", update);
        tg.offEvent?.("contentSafeAreaChanged", update);
      }
    };
  }, []);

  return topInset;
}
