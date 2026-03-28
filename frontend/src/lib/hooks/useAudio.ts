"use client";

import { useState, useCallback } from "react";

export function useAudio() {
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);

  const play = useCallback((sound?: string) => {
    // Placeholder — audio implementation to be added
  }, []);

  const toggleMusic = useCallback(() => setMusicEnabled(v => !v), []);
  const toggleSfx = useCallback(() => setSfxEnabled(v => !v), []);

  return { play, musicEnabled, sfxEnabled, toggleMusic, toggleSfx };
}
