"use client";

import { useActionState, useState } from "react";
import { createSession, type SessionFormState } from "./actions";
import { Input, Label, Select } from "@/components/ui/Input";
import { FormError } from "@/components/ui/FormError";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";

const initialState: SessionFormState = {};

interface SessionFormProps {
  // Omitted when a doctor is scheduling for themselves: the action takes
  // their doctorId from the session cookie and ignores any submitted
  // value, so there is nothing to pick.
  doctors?: { id: string; name: string }[];
  title?: string;
}

// Clinic-local calendar helpers. Dates are handled as plain YYYY-MM-DD
// strings throughout, never as Date objects, so a session booked for the
// 25th is the 25th regardless of the browser's timezone — the action
// parses the same string into a clinic-local instant.
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Monday-first grid, matching how Indian clinic rotas are written.
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const leading = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(leading).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = ["00", "15", "30", "45"];

/** 12-hour selection -> the "HH:MM" 24-hour value the action expects. */
function to24Hour(hour: string, minute: string, meridiem: string): string {
  let h = Number(hour) % 12;
  if (meridiem === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

function TimePicker({
  legend,
  idPrefix,
  hour,
  minute,
  meridiem,
  onChange,
}: {
  legend: string;
  idPrefix: string;
  hour: string;
  minute: string;
  meridiem: string;
  onChange: (part: "hour" | "minute" | "meridiem", value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground">{legend}</legend>
      <div className="flex items-center gap-1.5">
        <Select
          aria-label={`${legend} hour`}
          id={`${idPrefix}-hour`}
          value={hour}
          onChange={(e) => onChange("hour", e.target.value)}
          className="w-[4.5rem]"
        >
          {HOURS.map((h) => (
            <option key={h} value={String(h)}>
              {h}
            </option>
          ))}
        </Select>
        <span aria-hidden="true" className="text-muted">
          :
        </span>
        <Select
          aria-label={`${legend} minute`}
          id={`${idPrefix}-minute`}
          value={minute}
          onChange={(e) => onChange("minute", e.target.value)}
          className="w-[4.5rem]"
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          aria-label={`${legend} AM or PM`}
          id={`${idPrefix}-meridiem`}
          value={meridiem}
          onChange={(e) => onChange("meridiem", e.target.value)}
          className="w-[4.75rem]"
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </Select>
      </div>
    </fieldset>
  );
}

export function SessionForm({ doctors, title = "Create session" }: SessionFormProps) {
  const [state, formAction, pending] = useActionState(createSession, initialState);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(toISODate(today));

  const [start, setStart] = useState({ hour: "10", minute: "00", meridiem: "AM" });
  const [end, setEnd] = useState({ hour: "1", minute: "00", meridiem: "PM" });

  const cells = buildMonthGrid(viewYear, viewMonth);
  const todayISO = toISODate(today);

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  const startValue = to24Hour(start.hour, start.minute, start.meridiem);
  const endValue = to24Hour(end.hour, end.minute, end.meridiem);
  const endBeforeStart = endValue <= startValue;

  const selectedLabel = (() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${WEEKDAYS[(dt.getDay() + 6) % 7]}, ${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
  })();

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>

      {doctors && (
        <Label htmlFor="session-doctor">
          Doctor
          <Select id="session-doctor" name="doctorId" required>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.name}
              </option>
            ))}
          </Select>
        </Label>
      )}

      {/* The action still receives plain sessionDate / plannedStartAt /
          plannedEndAt strings — the calendar and 12-hour selects are a
          presentation layer over exactly the same three values. */}
      <input type="hidden" name="sessionDate" value={selectedDate} />
      <input type="hidden" name="plannedStartAt" value={startValue} />
      <input type="hidden" name="plannedEndAt" value={endValue} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Date</span>
        <div className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-2 pb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              ‹
            </button>
            <span aria-live="polite" className="text-sm font-medium text-foreground">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-border/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-center text-[11px] font-medium uppercase text-muted">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <span key={`pad-${i}`} />;
              const iso = toISODate(date);
              const isSelected = iso === selectedDate;
              const isToday = iso === todayISO;
              const isPast = iso < todayISO;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={isPast}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDate(iso)}
                  className={cn(
                    "h-9 rounded-md text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected && "bg-primary font-semibold text-primary-foreground",
                    !isSelected && isToday && "border border-primary/50 font-medium text-primary",
                    !isSelected && !isToday && !isPast && "text-foreground hover:bg-border/40",
                    isPast && "cursor-not-allowed text-muted/40",
                  )}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-muted">
          Selected: <span className="font-medium text-foreground">{selectedLabel}</span>
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <TimePicker
          legend="Starts"
          idPrefix="session-start"
          hour={start.hour}
          minute={start.minute}
          meridiem={start.meridiem}
          onChange={(part, value) => setStart((s) => ({ ...s, [part]: value }))}
        />
        <TimePicker
          legend="Ends"
          idPrefix="session-end"
          hour={end.hour}
          minute={end.minute}
          meridiem={end.meridiem}
          onChange={(part, value) => setEnd((s) => ({ ...s, [part]: value }))}
        />
      </div>

      {endBeforeStart && (
        <p className="text-sm text-danger" role="alert">
          The end time must be after the start time.
        </p>
      )}

      <Label htmlFor="session-location">
        Location
        <Input id="session-location" name="locationLabel" required placeholder="e.g. Room 1, 2nd floor" />
      </Label>

      <FormError>{state.error}</FormError>
      <Button type="submit" disabled={pending || endBeforeStart}>
        {pending ? "Creating..." : "Create session"}
      </Button>
    </form>
  );
}
