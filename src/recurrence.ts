import type { Task } from './store';

// A series row holds a repeat rule and is never listed itself. Its days are
// computed on demand; a day gets its own row only once the user touches it.

export type Repeat = { days: number[]; until: string | null };
export type Scope = 'one' | 'following';
// to: null = to the end of the series
export type Span = { from: string; to: string | null };

// only the fields the user changed
export type TaskEdit = {
  text?: string;
  details?: string;
  day?: string;
  remindAt?: string | null;
  // null = stop repeating
  repeat?: Repeat | null;
};

const DAY_MS = 86_400_000;
const MAX_DAY_NUM = 2_932_896; // 9999-12-31

// days
const dayNum = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
const fromDayNum = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const shiftDay = (key: string, by: number) => fromDayNum(dayNum(key) + by);
// 0 = Sunday … 6 = Saturday
export const weekdayOf = (key: string) => new Date(dayNum(key) * DAY_MS).getUTCDay();

export function cleanDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = [...new Set(raw)].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  return days.length ? days : null;
}

// first ticked weekday on or after `from`
export function firstMatch(days: number[], from: string): string | null {
  for (let i = 0; i < 7; i++) {
    const key = shiftDay(from, i);
    if (days.includes(weekdayOf(key))) return key;
  }
  return null;
}

// a rule that yields at least one day from `from` on
export function repeatValid(r: Repeat, from: string): boolean {
  const first = firstMatch(r.days, from);
  return first !== null && (r.until === null || first <= r.until);
}

// ids - the series id with its tail mixed with the day, so every device derives
// the same id for the same day. Series ids are always random, never derived.
export function occurrenceId(seriesId: string, day: string): string {
  const tail = (parseInt(seriesId.slice(28), 16) ^ dayNum(day)) >>> 0;
  return seriesId.slice(0, 28) + tail.toString(16).padStart(8, '0');
}

export function occursOnDay(s: Task, day: string): boolean {
  return s.repeatDays !== null && !s.deletedAt &&
    day >= s.day && (s.repeatUntil === null || day <= s.repeatUntil) &&
    s.repeatDays.includes(weekdayOf(day));
}

// an untouched day of a series
export function occurrence(s: Task, day: string): Task {
  return {
    ...s,
    id: occurrenceId(s.id, day),
    day,
    done: false,
    repeatDays: null,
    repeatUntil: null,
    seriesId: s.id,
    occursOn: day,
    deletedAt: null,
    dirty: false,
    rejected: undefined,
  };
}

// index
const slot = (seriesId: string, day: string) => `${seriesId}|${day}`;
const isRowOf = (t: Task, seriesId: string) =>
  t.repeatDays === null && t.seriesId === seriesId && t.occursOn !== null;

export type TaskIndex = { byDay: Map<string, Task[]>; series: Task[]; taken: Set<string>; ids: Set<string> };

export function indexTasks(tasks: Task[]): TaskIndex {
  const byDay = new Map<string, Task[]>();
  const series: Task[] = [];
  const taken = new Set<string>();
  const ids = new Set<string>();
  for (const t of tasks) {
    ids.add(t.id);
    if (t.repeatDays) {
      if (!t.deletedAt) series.push(t);
      continue;
    }
    // deleted rows still hold their slot, or a deleted day would come back
    if (t.seriesId && t.occursOn) taken.add(slot(t.seriesId, t.occursOn));
    if (t.deletedAt) continue;
    const list = byDay.get(t.day);
    if (list) list.push(t);
    else byDay.set(t.day, [t]);
  }
  return { byDay, series, taken, ids };
}

// the id check covers a day's row that an edit moved to a later stretch
const yields = (ix: TaskIndex, s: Task, day: string) =>
  occursOnDay(s, day) && !ix.taken.has(slot(s.id, day)) && !ix.ids.has(occurrenceId(s.id, day));

export function tasksOn(ix: TaskIndex, day: string): Task[] {
  return [
    ...(ix.byDay.get(day) ?? []),
    ...ix.series.filter(s => yields(ix, s, day)).map(s => occurrence(s, day)),
  ];
}

// untouched days with a reminder, for the next `count` days
export function upcomingReminders(ix: TaskIndex, from: string, count: number): Task[] {
  const out: Task[] = [];
  const withReminder = ix.series.filter(s => s.remindAt);
  if (!withReminder.length) return out;
  for (let i = 0; i < count; i++) {
    const day = shiftDay(from, i);
    for (const s of withReminder) if (yields(ix, s, day)) out.push(occurrence(s, day));
  }
  return out;
}

// id → its row, or the untouched day it stands for
export function resolve(tasks: Task[], id: string): Task | null {
  const row = tasks.find(t => t.id === id);
  if (row) return row;
  const head = id.slice(0, 28);
  for (const s of tasks) {
    if (!s.repeatDays || s.id.slice(0, 28) !== head) continue;
    const n = (parseInt(id.slice(28), 16) ^ parseInt(s.id.slice(28), 16)) >>> 0;
    if (!(n <= MAX_DAY_NUM)) continue;
    const day = fromDayNum(n);
    if (!occursOnDay(s, day)) continue;
    if (tasks.some(t => isRowOf(t, s.id) && t.occursOn === day)) continue;
    return occurrence(s, day);
  }
  return null;
}

// the live series a task's day still belongs to
export function activeSeries(tasks: Task[], t: Task): Task | null {
  if (t.repeatDays || !t.seriesId || !t.occursOn) return null;
  const s = tasks.find(x => x.id === t.seriesId);
  if (!s || !s.repeatDays || s.deletedAt) return null;
  return inRange(s, t.occursOn) ? s : null;
}

// every stretch split off a series; a deleted one still links to those after it
function descendants(tasks: Task[], s: Task): Task[] {
  return tasks
    .filter(t => t.repeatDays && t.seriesId === s.id)
    .flatMap(n => [n, ...descendants(tasks, n)]);
}

// live stretches after this one
export const continuations = (tasks: Task[], s: Task) => descendants(tasks, s).filter(c => !c.deletedAt);

// live stretches of the whole repeating task, whichever one `s` is
function lineage(tasks: Task[], s: Task): Task[] {
  let root = s;
  for (;;) {
    const parent = root.seriesId ? tasks.find(t => t.id === root.seriesId && t.repeatDays) : undefined;
    if (!parent) break;
    root = parent;
  }
  return [root, ...descendants(tasks, root)].filter(c => !c.deletedAt);
}

const inRange = (s: Task, day: string) =>
  day >= s.day && (s.repeatUntil === null || day <= s.repeatUntil);

// first and last day of the whole repeating task; last is null if it never ends
export function seriesRange(tasks: Task[], s: Task): { first: string; last: string | null } {
  const all = lineage(tasks, s);
  return {
    first: all.reduce((a, c) => (c.day < a ? c.day : a), s.day),
    last: all.some(c => c.repeatUntil === null)
      ? null
      : all.reduce((a, c) => (c.repeatUntil! > a ? c.repeatUntil! : a), s.repeatUntil!),
  };
}

// edits - each returns only the rows that change
export function touch(t: Task, patch: Partial<Task>, now: number): Task {
  return { ...t, ...patch, updatedAt: now, dirty: true, rejected: undefined };
}

export function upsert(tasks: Task[], changed: Task[]): Task[] {
  const next = new Map(tasks.map(t => [t.id, t]));
  changed.forEach(t => next.set(t.id, t));
  return [...next.values()];
}

type Content = Pick<Task, 'text' | 'details' | 'remindAt'>;

function contentOf(e: TaskEdit): Partial<Content> {
  return {
    ...(e.text !== undefined && { text: e.text }),
    ...(e.details !== undefined && { details: e.details }),
    ...(e.remindAt !== undefined && { remindAt: e.remindAt }),
  };
}

const ownPatch = (e: TaskEdit): Partial<Task> =>
  ({ ...contentOf(e), ...(e.day !== undefined && { day: e.day }) });

// one day, or a plain task
export const editOne = (t: Task, e: TaskEdit, now: number): Task[] => [touch(t, ownPatch(e), now)];

// plain task → repeating
export function makeSeries(t: Task, e: TaskEdit, repeat: Repeat, newId: string, now: number): Task[] {
  const own = touch(t, ownPatch(e), now);
  const start = firstMatch(repeat.days, own.day);
  if (!start || !repeatValid(repeat, own.day)) return [];
  const series = touch(own, {
    id: newId, day: start, done: false, deletedAt: null,
    repeatDays: repeat.days, repeatUntil: repeat.until, seriesId: null, occursOn: null,
  }, now);
  if (start === own.day) return [series, { ...own, seriesId: newId, occursOn: start }];
  // its own weekday isn't ticked: the series replaces it, unless it's already done
  return [series, t.done ? own : { ...own, deletedAt: now }];
}

// rows of `from`'s series on or after a day, brought in line with an edit
function alignRows(
  tasks: Task[], from: Task, since: string, to: { id: string; days: number[]; until: string | null },
  content: Partial<Content>, now: number,
): Task[] {
  const out: Task[] = [];
  for (const r of tasks) {
    if (!isRowOf(r, from.id) || r.occursOn! < since) continue;
    const patch: Partial<Task> = {};
    if (to.id !== from.id) patch.seriesId = to.id;
    if (!r.deletedAt && !r.done) {
      // a day the user customised keeps its own version
      (Object.keys(content) as (keyof Content)[]).forEach(k => {
        if (r[k] === from[k] && r[k] !== content[k]) Object.assign(patch, { [k]: content[k] });
      });
      const gone = !to.days.includes(weekdayOf(r.occursOn!)) || (to.until !== null && r.occursOn! > to.until);
      if (gone && r.day === r.occursOn) patch.deletedAt = now;
    }
    if (Object.keys(patch).length) out.push(touch(r, patch, now));
  }
  return out;
}

// this and future days - earlier days keep the old rule
export function editFollowing(tasks: Task[], t: Task, e: TaskEdit, newId: string, now: number): Task[] {
  const s = activeSeries(tasks, t);
  if (!s) return [];
  const from = t.occursOn!;
  const content = contentOf(e);
  const repeat = e.repeat ?? { days: s.repeatDays!, until: s.repeatUntil };
  const later = continuations(tasks, s);
  // a later stretch takes over after this one, so its end date is fixed
  const until = later.length ? s.repeatUntil : repeat.until;
  const start = firstMatch(repeat.days, from);
  if (!start || (!later.length && !repeatValid(repeat, from))) return [];

  const rule = { day: start, repeatDays: repeat.days, repeatUntil: until };
  // no ticked day left before the later stretch takes over
  const empty = until !== null && start > until;
  const inPlace = from <= s.day;
  const out: Task[] = [];

  if (empty) {
    out.push(touch(s, inPlace ? { deletedAt: now } : { repeatUntil: shiftDay(from, -1) }, now));
  } else if (inPlace) {
    out.push(touch(s, { ...content, ...rule }, now));
  } else {
    out.push(touch(s, { repeatUntil: shiftDay(from, -1) }, now));
    out.push(touch(s, { ...content, ...rule, id: newId, seriesId: s.id }, now));
  }
  const targetId = inPlace || empty ? s.id : newId;
  out.push(...alignRows(tasks, s, from, { id: targetId, days: repeat.days, until }, content, now));

  // stretches split off by earlier edits get the same changes
  const daysChanged = e.repeat && e.repeat.days.join() !== s.repeatDays!.join();
  for (const c of later) {
    const days = daysChanged ? repeat.days : c.repeatDays!;
    const first = firstMatch(days, c.day)!;
    out.push(touch(c, {
      ...content, repeatDays: days, day: first,
      ...(c.seriesId === s.id && { seriesId: targetId }),
    }, now));
    out.push(...alignRows(tasks, c, c.day, { id: c.id, days, until: c.repeatUntil }, content, now));
  }
  if (targetId !== s.id) out.push(...relinkDeleted(tasks, s.id, targetId, now));

  // the tapped day takes the edit outright, even where it had its own version
  const row = tasks.find(x => x.id === t.id);
  if (!row) return out;
  const aligned = out.find(x => x.id === row.id) ?? row;
  return upsert(out, [touch(aligned, content, now)]);
}

// deleted stretches carry the link to those after them
const relinkDeleted = (tasks: Task[], from: string, to: string, now: number) =>
  tasks
    .filter(x => x.repeatDays && x.deletedAt && x.seriesId === from)
    .map(x => touch(x, { seriesId: to }, now));

// end date only
export function setUntil(tasks: Task[], s: Task, until: string | null, now: number): Task[] {
  return [
    touch(s, { repeatUntil: until }, now),
    ...alignRows(tasks, s, s.day, { id: s.id, days: s.repeatDays!, until }, {}, now)
      .filter(r => r.occursOn! > (until ?? r.occursOn!)),
  ];
}

// stop repeating: this day stays as a one-off, later ones go
export function endFollowing(tasks: Task[], t: Task, keep: TaskEdit, now: number): Task[] {
  const s = activeSeries(tasks, t);
  if (!s) return [];
  const from = t.occursOn!;
  const later = continuations(tasks, s);
  const out: Task[] = [
    touch(s, from <= s.day ? { deletedAt: now } : { repeatUntil: shiftDay(from, -1) }, now),
    ...later.map(c => touch(c, { deletedAt: now }, now)),
  ];
  for (const r of tasks) {
    if (r.id === t.id || r.deletedAt || r.done) continue;
    const mine = isRowOf(r, s.id) && r.occursOn! >= from;
    if (mine || later.some(c => isRowOf(r, c.id))) out.push(touch(r, { deletedAt: now }, now));
  }
  out.push(touch(t, ownPatch(keep), now));
  return out;
}

// unfinished days from–to; the task carries on after the span if it has days left
export function deleteSpan(tasks: Task[], t: Task, span: Span, newId: string, now: number): Task[] {
  const s = activeSeries(tasks, t);
  if (!s) return [];
  const { from, to } = span;
  const out: Task[] = [];
  for (const c of lineage(tasks, s)) {
    if ((c.repeatUntil !== null && c.repeatUntil < from) || (to !== null && c.day > to)) continue;

    const next = to === null ? null : firstMatch(c.repeatDays!, shiftDay(to, 1));
    // where this stretch picks up again
    const resume = next !== null && (c.repeatUntil === null || next <= c.repeatUntil) ? next : null;
    const split = from > c.day && resume !== null;

    if (from <= c.day) {
      out.push(touch(c, resume ? { day: resume } : { deletedAt: now }, now));
    } else {
      out.push(touch(c, { repeatUntil: shiftDay(from, -1) }, now));
      if (split) {
        out.push(touch(c, { id: newId, seriesId: c.id, day: resume! }, now));
        tasks.filter(x => x.repeatDays && x.seriesId === c.id)
          .forEach(x => out.push(touch(x, { seriesId: newId }, now)));
      }
    }

    for (const r of tasks) {
      // a row outside the stretch was kept as a single task
      if (!isRowOf(r, c.id) || !inRange(c, r.occursOn!) || r.occursOn! < from) continue;
      if (to !== null && r.occursOn! > to) {
        if (split) out.push(touch(r, { seriesId: newId }, now));
      } else if (!r.deletedAt && !r.done) {
        out.push(touch(r, { deletedAt: now }, now));
      }
    }
  }
  return out;
}

// how many unfinished days a span removes; null = it never ends
export function spanDays(tasks: Task[], t: Task, { from, to }: Span): number | null {
  const s = activeSeries(tasks, t);
  if (!s) return 0;
  const all = lineage(tasks, s);
  const { first, last } = seriesRange(tasks, s);
  const end = to === null ? last : last !== null && last < to ? last : to;
  if (end === null) return null;
  const ix = indexTasks(tasks);
  let n = tasks.filter(r =>
    !r.deletedAt && !r.done && r.occursOn !== null && r.occursOn >= from && r.occursOn <= end &&
    all.some(c => isRowOf(r, c.id) && inRange(c, r.occursOn!))).length;
  for (let d = from > first ? from : first; d <= end; d = shiftDay(d, 1)) {
    n += all.filter(c => yields(ix, c, d)).length;
  }
  return n;
}

// the whole repeating task, past and completed days included
export function deleteAll(tasks: Task[], t: Task, now: number): Task[] {
  const s = activeSeries(tasks, t);
  if (!s) return [];
  const all = lineage(tasks, s);
  return [
    ...all.map(c => touch(c, { deletedAt: now }, now)),
    ...tasks
      .filter(r => !r.deletedAt && all.some(c => isRowOf(r, c.id) && inRange(c, r.occursOn!)))
      .map(r => touch(r, { deletedAt: now }, now)),
  ];
}

// undo - rows that put `changed` back the way they were in `before`
export function revert(before: Task[], changed: Task[], now: number): Task[] {
  const was = new Map(before.map(t => [t.id, t]));
  return changed.map(c => {
    const old = was.get(c.id) ?? resolve(before, c.id);
    // an untouched day goes back to its series' values; deleting it would hide the day
    return old ? touch(old, {}, now) : touch(c, { deletedAt: now }, now);
  });
}
