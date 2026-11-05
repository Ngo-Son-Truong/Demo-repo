"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Local mic / camera handling. Devices are only requested after an explicit click,
 * and every track is stopped again when the user mutes or leaves the table.
 */
export function useLocalMedia() {
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const stopMic = useCallback(() => {
    setMicStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    setSpeaking(false);
    setMicLevel(0);
    analyserRef.current = null;
    setError(null);
  }, []);

  const stopCamera = useCallback(() => {
    setCameraStream((stream) => {
      stream?.getTracks().forEach((track) => track.stop());
      return null;
    });
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
  }, []);

  const enableMic = useCallback(async () => {
    if (micStream) return micStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setMicStream(stream);
      micStreamRef.current = stream;
      setError(null);

      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const ctx = new Ctor();
        await ctx.resume();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);
        let lastUpdate = 0;
        const tick = (now: number) => {
          const current = analyserRef.current;
          if (!current) return;
          if (now - lastUpdate > 90) {
            lastUpdate = now;
            current.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
            const rms = Math.sqrt(sum / data.length) / 255;
            setMicLevel(rms);
            setSpeaking(rms > 0.055);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
      return stream;
    } catch (err) {
      setError("Không thể truy cập micro. Hãy kiểm tra quyền trình duyệt.");
      return null;
    }
  }, [micStream]);

  const enableCamera = useCallback(async () => {
    if (cameraStream) return cameraStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      setCameraStream(stream);
      cameraStreamRef.current = stream;
      setError(null);
      return stream;
    } catch (err) {
      setError("Không thể truy cập camera. Hãy kiểm tra quyền trình duyệt.");
      return null;
    }
  }, [cameraStream]);

  const stopAll = useCallback(() => {
    stopMic();
    stopCamera();
  }, [stopMic, stopCamera]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      void audioCtxRef.current?.close();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    micStream,
    cameraStream,
    micLevel,
    speaking,
    error,
    enableMic,
    enableCamera,
    stopMic,
    stopCamera,
    stopAll,
    clearError: () => setError(null),
  };
}
