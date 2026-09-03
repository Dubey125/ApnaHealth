# Queue Rules

## Token entry
Walk-in tokens are allocated atomically. Two front-desk devices must never receive the same token number.
Self-booking is public but rate-limited.

## Session transitions
SCHEDULED -> OPEN -> IN_PROGRESS -> CLOSED
IN_PROGRESS -> PAUSED -> IN_PROGRESS
Invalid transitions must be rejected by a tested pure function.

## Done — call next
Transactionally:
1. end current consultation
2. mark COMPLETED
3. write CONSULT_ENDED
4. start next eligible token
5. mark IN_CONSULT
6. write CONSULT_STARTED

## Reordering

Queue order is `queuePriority DESC, tokenNumber ASC`, defined once in
`src/lib/queue/ordering.ts` and imported everywhere. Default priority is 0,
so a queue with nobody prioritised is in plain token order.

A reorder **never renumbers a token**. The token number is the patient's
identity — on their ticket, on the waiting-room screen, and in what is
called out — so service order is carried by a separate column.

Only a CHECKED_IN patient can be moved forward, because only a CHECKED_IN
patient can be called at all. Moving a patient forward puts them at the
front of the waiting queue; prioritising a second patient puts that
patient ahead of the first, so the most recent decision wins.

**A human decides.** Nothing promotes a patient automatically — not the
prediction engine, not a rule, not a score. There is no urgency
calculation. The system records a decision a person made.

Every reorder writes an append-only `TOKEN_REORDERED` QueueEvent carrying
the actor, the time, and metadata of `reason`, `fromPosition`,
`toPosition`, `previousPriority` and `newPriority`. A reason is required
when moving a patient forward and optional when undoing it: moving one
patient forward moves every other waiting patient back, whereas putting
the queue back is a correction a busy counter must be able to make in one
click.

The reason is staff-authored operational text. It appears on the clinic's
own console and in the audit log. It is never shown to any patient and
never appears on the waiting-room display.

Reordering changes what every waiting patient is told, so the same
ordering rule governs "call next", the console, the waiting-room display,
the patient's ticket page, the patient's appointments page and the
prediction engine's `tokensAhead`. Counting positions by token number
alone is wrong once anyone is prioritised: a patient moved to the front
keeps their high number, so everyone behind them would count that patient
as already seen and under-estimate their own wait by a whole
consultation.

## Patient page
Polling is acceptable. Never reveal other patients' names or phones.

## Scheduled breaks
A SessionBreak (startAt, endAt, reason) is a planned, known-in-advance block
of time — e.g. a fixed lunch break — during which the doctor is not
consulting. It is distinct from Session.status = PAUSED, which is an
unplanned, open-ended interruption with no known end time and remains
handled entirely through the existing pause/resume mechanism.

The prediction engine must never predict a consultation start inside a
scheduled break. When the naive (break-unaware) calculation would fall
inside one, recalculate by skipping forward: time already consumed before
the break counts toward the prediction as normal, the break's own duration
never counts as consultation time, and the remaining work resumes being
consumed from the break's endAt. A prediction pushed past one break may
still land inside a later one, so breaks are applied in order.

## Prediction baseline

### baseline-v1 (current)

Identical to baseline-v0 below in every respect except one: instead of
`tokensAhead x median`, it **sums the expected duration of each patient
ahead**, using a service-time median kept per `Token.visitType`.

service time for a visit type:
- that type's median across the doctor's last 30 days, if at least 5
  completed consultations of that type exist
- else the overall median (the v0 tiering below)

UNSPECIFIED never forms a distribution of its own. Historical tokens all
carry it, and treating "nobody recorded this" as a category would dress
absence up as a finding. It uses — and contributes to — the overall
median.

The type is captured at the counter or by the patient when booking, and
the doctor can correct it from the consultation screen — they are the one
who knows what the appointment actually was. A correction changes future
predictions and the per-type medians they read; it never rewrites a
PredictionSnapshot, which is the record of what a patient was actually
told. Corrections are recorded as an `AuditEvent`
(`TOKEN_VISIT_TYPE_CORRECTED`) carrying only the old and new type.

The patient currently in consult is measured against **their own** type's
expected length, so a procedure under way is not assumed nearly finished
because an average consultation would have been.

With no type evidence, v1 produces byte-identical output to v0. A clinic
that has never recorded a visit type keeps the model it already had, and
improves as evidence accumulates rather than on the day the column was
added. This is asserted by a test.

Break handling and window arithmetic are unchanged from v0.

**Do not claim v1 is more accurate than v0 without checking.** The clinic
analytics page reports window hit rate and median error split by
modelVersion, over the clinic's own queue. Read the sample sizes: the two
models ran over different periods, so it is a record of what happened,
not a controlled experiment.

### baseline-v0 (superseded)

modelVersion: baseline-v0

median service time:
- last 8 completed durations if >= 3 exist
- else doctor's last 30 days if >= 5 exist
- else doctor's default consultation minutes

remaining current consultation:
max(0, median - elapsed)

predicted start:
now + remaining current + tokensAhead * median, then shifted forward past
any scheduled break it would otherwise fall inside (see "Scheduled breaks")

window start:
predicted - max(300 sec, 15% of ETA), then shifted forward to a break's end
if it would otherwise fall inside one

window end:
predicted + max(600 sec, 35% of ETA)

Never present an exact time as guaranteed.

## Primary research metrics
- prediction window hit rate
- median waiting time
- 90th percentile waiting time
- median consultation duration
- no-show rate
