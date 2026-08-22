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
