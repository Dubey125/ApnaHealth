"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatClinicTime } from "@/lib/format";

interface OPDDisplayProps {
  doctorName: string;
  doctorSpecialty: string;
  locationLabel: string;
  clinicName: string;
  sessionStatus: string;
  currentNumber: number | null;
  currentPatientName?: string | null;
  consultStartedAt?: Date | null;
  readyTokens: { id: string; tokenNumber: number; patientNameSnapshot: string }[];
  activeBreak?: { reason: string; endAt: Date } | null;
}

export function OPDDisplayMode({
  doctorName,
  doctorSpecialty,
  locationLabel,
  clinicName,
  sessionStatus,
  currentNumber,
  currentPatientName,
  consultStartedAt,
  readyTokens,
  activeBreak,
}: OPDDisplayProps) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevTokenRef = useRef<number | null>(currentNumber);

  // Play a pleasant two-tone medical notification chime using Web Audio API
  const playChime = useCallback(() => {
    if (!audioEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      // First tone (G5 = 783.99 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(784, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.6);

      // Second tone (C6 = 1046.50 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1046.5, now + 0.25);
      gain2.gain.setValueAtTime(0, now + 0.25);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.25);
      osc2.stop(now + 1.2);
    } catch {
      // Audio context may be restricted by browser policy before interaction
    }
  }, [audioEnabled]);

  // Trigger chime when current token changes
  useEffect(() => {
    if (currentNumber !== null && prevTokenRef.current !== currentNumber) {
      playChime();
      prevTokenRef.current = currentNumber;
    }
  }, [currentNumber, playChime]);

  // Live digital clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none overflow-hidden">
      {/* Top Banner */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-8 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400 font-bold text-2xl border border-teal-500/30">
            AH
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{clinicName}</h1>
            <p className="text-sm font-medium text-teal-400">
              {doctorName} · {doctorSpecialty} · <span className="text-slate-300 font-semibold">{locationLabel}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => {
              setAudioEnabled((prev) => !prev);
              if (!audioEnabled) {
                // Play a brief test tone on enable
                setTimeout(() => playChime(), 100);
              }
            }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
              audioEnabled
                ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                : "bg-slate-800 text-slate-400 hover:text-white border border-slate-700"
            }`}
          >
            <span>{audioEnabled ? "🔔 Audio Chime: ON" : "🔕 Audio Chime: OFF"}</span>
          </button>

          <div className="text-right">
            <div className="text-3xl font-mono font-bold tracking-wider text-slate-100 tabular-nums">
              {formatClinicTime(currentTime)}
            </div>
            <div className="text-xs text-slate-400 font-medium">LIVE OPD QUEUE</div>
          </div>
        </div>
      </header>

      {/* Main Waiting Room Display Grid */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-12 gap-8 p-8 items-stretch overflow-hidden">
        {/* Left 7 cols: Current Token in Consult */}
        <div className="lg:col-span-7 flex flex-col justify-center items-center rounded-3xl border-2 border-teal-500/40 bg-gradient-to-b from-teal-950/40 via-slate-900 to-slate-950 p-10 text-center shadow-2xl relative">
          <div className="absolute top-6 left-8 flex items-center gap-2">
            <span className="flex h-3.5 w-3.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-teal-500"></span>
            </span>
            <span className="text-sm font-bold tracking-widest uppercase text-teal-400">NOW CONSULTING</span>
          </div>

          {activeBreak ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-amber-500/20 p-6 text-amber-400 text-5xl">☕</div>
              <h2 className="text-3xl font-bold text-amber-300">Doctor is on a short break</h2>
              <p className="text-xl text-slate-300 max-w-md">{activeBreak.reason}</p>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-6 py-2 text-lg font-mono text-amber-300">
                Resumes at {formatClinicTime(activeBreak.endAt)}
              </div>
            </div>
          ) : currentNumber !== null ? (
            <div className="flex flex-col items-center gap-4 my-auto">
              <span className="text-lg font-bold tracking-widest text-slate-400 uppercase">TOKEN NUMBER</span>
              <div className="text-8xl lg:text-[140px] font-black tabular-nums tracking-tighter text-white drop-shadow-[0_0_35px_rgba(45,212,191,0.4)] leading-none">
                #{currentNumber}
              </div>
              {currentPatientName && (
                <div className="text-2xl lg:text-3xl font-semibold text-teal-200 mt-2">
                  {currentPatientName}
                </div>
              )}
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-6 py-2 text-base font-semibold text-teal-300 border border-teal-500/30">
                <span>Please proceed to {locationLabel}</span>
              </div>
              {consultStartedAt && (
                <span className="text-xs text-slate-400">
                  In consultation since {formatClinicTime(consultStartedAt)}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 my-auto">
              <div className="text-6xl text-slate-600">⏳</div>
              <h2 className="text-2xl font-bold text-slate-300">Preparing Next Patient</h2>
              <p className="text-base text-slate-400">
                {readyTokens.length > 0
                  ? `Token #${readyTokens[0].tokenNumber} please be ready.`
                  : "Waiting for patients to check in."}
              </p>
            </div>
          )}
        </div>

        {/* Right 5 cols: Next in Line */}
        <div className="lg:col-span-5 flex flex-col rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <h2 className="text-lg font-bold uppercase tracking-wider text-slate-300">
              NEXT IN LINE ({readyTokens.length})
            </h2>
            <span className="text-xs font-semibold text-slate-400">CHECKED IN</span>
          </div>

          {readyTokens.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-8 text-slate-500">
              <p className="text-lg font-medium">No checked-in patients waiting</p>
              <p className="text-xs mt-1">Please check in at the reception desk upon arrival.</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3 overflow-hidden">
              {readyTokens.slice(0, 5).map((token, index) => (
                <div
                  key={token.id}
                  className={`flex items-center justify-between rounded-2xl p-4 border transition-all ${
                    index === 0
                      ? "border-teal-500/60 bg-teal-950/30 text-white shadow-lg"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold text-lg ${
                        index === 0
                          ? "bg-teal-500 text-slate-950 font-black"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-2xl font-bold tabular-nums">#{token.tokenNumber}</div>
                      <div className="text-sm font-medium truncate max-w-[180px] text-slate-300">
                        {token.patientNameSnapshot}
                      </div>
                    </div>
                  </div>
                  {index === 0 && (
                    <span className="rounded-full bg-teal-500/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-teal-300 border border-teal-500/40 animate-pulse">
                      NEXT UP
                    </span>
                  )}
                </div>
              ))}
              {readyTokens.length > 5 && (
                <p className="text-center text-xs font-medium text-slate-500 mt-2">
                  + {readyTokens.length - 5} more patients waiting in queue
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer ticker */}
      <footer className="border-t border-slate-800 bg-slate-900 px-8 py-3 flex items-center justify-between text-xs text-slate-400">
        <div>
          Session Status: <span className="font-semibold text-slate-200">{sessionStatus}</span> · Please keep your token number handy
        </div>
        <div className="flex items-center gap-2">
          <span>Powered by</span>
          <span className="font-bold text-teal-400">ApnaHealth Live Queue</span>
        </div>
      </footer>
    </div>
  );
}
