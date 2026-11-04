"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AmbientEngine } from "@/lib/audio/ambientEngine";
import type { AmbienceSettings, MusicMood } from "@/lib/types";

export type AmbienceLayer = "rain" | "waves" | "birds" | "wind";

const DEFAULTS: AmbienceSettings = {
  playing: false,
  volume: 0.5,
  mood: "lofi",
  rain: true,
  waves: false,
  birds: false,
  wind: false,
};

export function useAmbientAudio(initial?: Partial<AmbienceSettings>) {
  const settingsRef = useRef<AmbienceSettings>({ ...DEFAULTS, ...initial });
  const engineRef = useRef<AmbientEngine | null>(null);
  const [playing, setPlaying] = useState(settingsRef.current.playing);
  const [volume, setVolumeState] = useState(settingsRef.current.volume);
  const [mood, setMoodState] = useState<MusicMood>(settingsRef.current.mood);
  const [layers, setLayersState] = useState<Record<AmbienceLayer, boolean>>({
    rain: settingsRef.current.rain,
    waves: settingsRef.current.waves,
    birds: settingsRef.current.birds,
    wind: settingsRef.current.wind,
  });

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AmbientEngine(settingsRef.current);
    }
    return engineRef.current;
  }, []);

  const play = useCallback(() => {
    const engine = ensureEngine();
    engine.play();
    settingsRef.current = { ...settingsRef.current, playing: true };
    setPlaying(true);
  }, [ensureEngine]);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    settingsRef.current = { ...settingsRef.current, playing: false };
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    settingsRef.current = { ...settingsRef.current, volume: clamped };
    setVolumeState(clamped);
    engineRef.current?.setVolume(clamped);
  }, []);

  const setMood = useCallback((next: MusicMood) => {
    settingsRef.current = { ...settingsRef.current, mood: next };
    setMoodState(next);
    engineRef.current?.setMood(next);
  }, []);

  const toggleLayer = useCallback((layer: AmbienceLayer) => {
    setLayersState((prev) => {
      const next = { ...prev, [layer]: !prev[layer] };
      settingsRef.current = { ...settingsRef.current, ...next };
      engineRef.current?.setAmbience(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return { playing, volume, mood, layers, play, pause, toggle, setVolume, setMood, toggleLayer };
}

export type AmbientAudioController = ReturnType<typeof useAmbientAudio>;
