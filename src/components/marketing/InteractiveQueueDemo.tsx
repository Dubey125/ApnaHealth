"use client";

import { useState } from "react";
import { formatClinicTime } from "@/lib/format";
import { TokenStatusBadge } from "@/components/ui/StatusBadge";

export function InteractiveQueueDemo() {
  const [tokenNum] = useState(18);
  const [currentServing, setCurrentServing] = useState(14);
  const [isOnBreak, setIsOnBreak] = useState(false);

  // Dynamic ETA calculation for demo
  const tokensAhead = Math.max(0, tokenNum - currentServing - 1);
  const baseMinutesPerPatient = 8;
  const breakDelay = isOnBreak ? 25 : 0;
  const totalWaitMinutes = (tokensAhead + 1) * baseMinutesPerPatient + breakDelay;

  const now = new Date();
  const etaStart = new Date(now.getTime() + totalWaitMinutes * 60 * 1000);
  const etaEnd = new Date(etaStart.getTime() + 15 * 60 * 1000);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-teal-500/30 bg-gradient-to-b from-teal-950/20 via-surface to-surface p-6 shadow-lg sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary border border-teal-500/20">
            Interactive Live Queue Demo
          </span>
          <h3 className="text-xl font-bold text-foreground mt-1">Experience Live Queue Intelligence</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Simulation Controls:</span>
          <button
            type="button"
            onClick={() => setCurrentServing((prev) => (prev < tokenNum ? prev + 1 : 12))}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-border/40 transition-colors"
          >
            Advance Queue ({currentServing < tokenNum ? `Next: #${currentServing + 1}` : "Reset"})
          </button>
          <button
            type="button"
            onClick={() => setIsOnBreak((b) => !b)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isOnBreak
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                : "border border-border bg-background text-muted hover:text-foreground"
            }`}
          >
            {isOnBreak ? "☕ Break Active (+25m)" : "☕ Simulate Doctor Break"}
          </button>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: Your Live Token */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-primary/30 bg-primary/5 p-5 text-center relative overflow-hidden">
          <div className="absolute top-3 left-3">
            <TokenStatusBadge status={currentServing === tokenNum ? "IN_CONSULT" : "CHECKED_IN"} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted mt-4">Your Token</span>
          <div className="text-5xl font-black tabular-nums text-foreground my-2">#{tokenNum}</div>
          <p className="text-xs font-medium text-primary">
            {currentServing === tokenNum ? "It's your turn! Please enter consultation room." : `${tokensAhead} patients ahead of you`}
          </p>
        </div>

        {/* Card 2: Now Consulting */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-background p-5 text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted">Currently In Consult</span>
          <div className="text-5xl font-bold tabular-nums text-foreground my-2">#{currentServing}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
            <span>Room 1 · Dr. Aditi Sharma</span>
          </div>
        </div>

        {/* Card 3: Dynamic Estimated Arrival Window */}
        <div className="flex flex-col justify-center rounded-xl border border-info/30 bg-info/5 p-5 sm:col-span-2 lg:col-span-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-info">Dynamic Arrival Window</span>
          <div className="text-2xl font-bold text-foreground my-1.5 tabular-nums">
            {formatClinicTime(etaStart)} – {formatClinicTime(etaEnd)}
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {isOnBreak ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ ETA pushed by 25 mins due to scheduled doctor break.
              </span>
            ) : (
              "Calculated from doctor's 8m median consult time and live queue progress."
            )}
          </p>
        </div>
      </div>

      {/* Progress Line */}
      <div className="flex flex-col gap-2 rounded-xl bg-background border border-border p-4">
        <div className="flex items-center justify-between text-xs text-muted font-medium">
          <span>Queue Position</span>
          <span>{currentServing === tokenNum ? "Your Turn" : `Arrive in ~${totalWaitMinutes} mins`}</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-border/60 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(15, (currentServing / tokenNum) * 100))}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted">
          <span>#1 (Session Start)</span>
          <span className="font-semibold text-foreground">Now: #{currentServing}</span>
          <span>Your: #{tokenNum}</span>
          <span>#25 (Cap)</span>
        </div>
      </div>
    </div>
  );
}
