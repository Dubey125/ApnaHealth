import { formatClinicTime } from "@/lib/format";

// A "where is my train"-style live position tracker for the patient's own
// token, built on NN/g's virtual-queue findings: show low-granularity
// movement (each token ahead is its own visible stop, not just a count),
// give the patient's own position a distinct "you are here" marker, pair
// place-in-line with an ETA, and show a live indicator so the page reads
// as awake without the patient having to parse text.
//
// Deliberately shows token NUMBERS only — never a name or phone for
// anyone else in the line (QUEUE_RULES.md's no-other-patient-PII rule,
// the same boundary the rest of the ticket page respects).
//
// Per-stop ETAs are intentionally NOT rendered: the prediction baseline is
// a locked, tested contract (QUEUE_RULES.md "baseline-v0"), and deriving a
// separate time for each intermediate stop would mean re-implementing that
// math outside the one function that owns it. The patient's own window is
// the single predicted value shown, exactly as computed upstream.

interface RelevantBreak {
  startAt: Date;
  endAt: Date;
}

interface QueueJourneyProps {
  myTokenNumber: number;
  nowServingNumber: number | null;
  aheadNumbers: number[];
  windowStartAt: Date;
  windowEndAt: Date;
  relevantBreak: RelevantBreak | null;
}

// Long queues collapse in the middle rather than rendering 30 stops: the
// nearest few and the one immediately before the patient are what convey
// movement between polls.
const HEAD_STOPS = 2;
const TAIL_STOPS = 1;

function Rail({ muted = false }: { muted?: boolean }) {
  return <span aria-hidden="true" className={`ml-[7px] block w-px flex-1 ${muted ? "bg-border" : "bg-border"}`} />;
}

function Stop({
  children,
  dot,
  className = "",
}: {
  children: React.ReactNode;
  dot: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={`flex items-center gap-3 ${className}`}>
      <span className="flex w-4 shrink-0 justify-center">{dot}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

export function QueueJourney({
  myTokenNumber,
  nowServingNumber,
  aheadNumbers,
  windowStartAt,
  windowEndAt,
  relevantBreak,
}: QueueJourneyProps) {
  const collapsed = aheadNumbers.length > HEAD_STOPS + TAIL_STOPS + 1;
  const head = collapsed ? aheadNumbers.slice(0, HEAD_STOPS) : aheadNumbers;
  const tail = collapsed ? aheadNumbers.slice(-TAIL_STOPS) : [];
  const hiddenCount = collapsed ? aheadNumbers.length - HEAD_STOPS - TAIL_STOPS : 0;

  return (
    <section aria-label="Your position in the queue" className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Your place in line</h2>
        <span className="text-xs text-muted">
          {aheadNumbers.length === 0
            ? "You're next"
            : `${aheadNumbers.length} ahead of you`}
        </span>
      </div>

      <ol className="flex flex-col px-4 py-4">
        {/* Now serving — the live head of the queue. */}
        <Stop
          dot={
            <span className="relative flex h-4 w-4 items-center justify-center">
              {nowServingNumber !== null && (
                <span className="absolute inline-flex h-4 w-4 animate-ping rounded-full bg-primary/40" />
              )}
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
          }
        >
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Now serving</span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {nowServingNumber !== null ? `#${nowServingNumber}` : "—"}
            </span>
          </span>
        </Stop>

        <li aria-hidden="true" className="flex h-4">
          <Rail />
        </li>

        {head.map((number) => (
          <StopWithRail key={number} number={number} />
        ))}

        {collapsed && (
          <>
            <Stop
              dot={
                <span className="flex flex-col items-center gap-[3px]" aria-hidden="true">
                  <span className="h-[3px] w-[3px] rounded-full bg-border" />
                  <span className="h-[3px] w-[3px] rounded-full bg-border" />
                  <span className="h-[3px] w-[3px] rounded-full bg-border" />
                </span>
              }
            >
              <span className="text-sm text-muted">
                {hiddenCount} more {hiddenCount === 1 ? "person" : "people"}
              </span>
            </Stop>
            <li aria-hidden="true" className="flex h-4">
              <Rail />
            </li>
          </>
        )}

        {tail.map((number) => (
          <StopWithRail key={number} number={number} />
        ))}

        {/* A scheduled break sits between the queue ahead and the patient:
            it is real elapsed time the prediction already accounts for, so
            showing it here explains *why* the window is where it is. */}
        {relevantBreak && (
          <>
            <Stop
              dot={
                <span aria-hidden="true" className="inline-flex h-3 w-3 rounded-full border-2 border-dashed border-warning" />
              }
            >
              <span className="text-sm text-warning">
                Doctor&apos;s break · {formatClinicTime(relevantBreak.startAt)} – {formatClinicTime(relevantBreak.endAt)}
              </span>
            </Stop>
            <li aria-hidden="true" className="flex h-4">
              <Rail />
            </li>
          </>
        )}

        {/* "You are here." */}
        <Stop
          className="rounded-lg bg-primary/5 py-2"
          dot={<span aria-hidden="true" className="inline-flex h-4 w-4 rounded-full border-[3px] border-primary bg-background" />}
        >
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-bold tabular-nums text-primary">#{myTokenNumber}</span>
            <span className="text-sm font-medium text-foreground">You</span>
          </span>
        </Stop>
      </ol>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">Be at the clinic by</div>
        <div className="text-2xl font-bold tabular-nums text-foreground">{formatClinicTime(windowStartAt)}</div>
        <div className="mt-0.5 text-sm text-muted">
          Your turn is expected between {formatClinicTime(windowStartAt)} and {formatClinicTime(windowEndAt)}. This is an
          estimate, not a guarantee.
        </div>
      </div>
    </section>
  );
}

function StopWithRail({ number }: { number: number }) {
  return (
    <>
      <Stop dot={<span aria-hidden="true" className="inline-flex h-3 w-3 rounded-full border-2 border-border bg-background" />}>
        <span className="text-sm tabular-nums text-muted">#{number}</span>
      </Stop>
      <li aria-hidden="true" className="flex h-4">
        <Rail />
      </li>
    </>
  );
}
