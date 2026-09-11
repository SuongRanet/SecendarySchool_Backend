/**
 * The date arithmetic behind the seeded school year.
 *
 * Kept separate from the seeds themselves, and free of any database access, so
 * the rules that decide "which day is a school day" and "where does today sit
 * in the year" can be tested directly rather than by inspecting a seeded
 * database and guessing.
 */

/** A date as `YYYY-MM-DD`, which is how every date column here is handled. */
export type IsoDate = string;

export const iso = (date: Date): IsoDate => date.toISOString().slice(0, 10);

export const parseIso = (date: IsoDate): Date => new Date(`${date}T00:00:00Z`);

export const addDays = (date: IsoDate, days: number): IsoDate => {
  const next = parseIso(date);
  next.setUTCDate(next.getUTCDate() + days);

  return iso(next);
};

export const weeks = (count: number): number => count * 7;

/** The Monday of the week containing `date`; Sunday counts as the week before. */
export const mondayOf = (date: IsoDate): IsoDate => {
  const day = parseIso(date).getUTCDay();

  return addDays(date, day === 0 ? -6 : 1 - day);
};

/**
 * Every Monday-to-Friday date in the range, optionally stopping at `cutoff`.
 *
 * The cutoff is what keeps the register honest: a term that is still running
 * must not have attendance recorded for days the school has not reached yet.
 */
export const schoolDays = (from: IsoDate, to: IsoDate, cutoff?: IsoDate): IsoDate[] => {
  const last = cutoff && cutoff < to ? cutoff : to;
  const days: IsoDate[] = [];

  for (let day = from; day <= last; day = addDays(day, 1)) {
    const weekday = parseIso(day).getUTCDay();

    if (weekday >= 1 && weekday <= 5) {
      days.push(day);
    }
  }

  return days;
};

/** How much of a range has elapsed by `on`, as a fraction clamped to 0..1. */
export const elapsedFraction = (from: IsoDate, to: IsoDate, on: IsoDate): number => {
  const span = parseIso(to).getTime() - parseIso(from).getTime();

  if (span <= 0) {
    return 1;
  }

  const done = parseIso(on).getTime() - parseIso(from).getTime();

  return Math.max(0, Math.min(1, done / span));
};

/** A date a given fraction of the way through a range, snapped to a whole day. */
export const dateWithin = (from: IsoDate, to: IsoDate, ratio: number): IsoDate => {
  const start = parseIso(from).getTime();
  const end = parseIso(to).getTime();

  return iso(new Date(start + (end - start) * ratio));
};

export interface Semester {
  name: string;
  order: number;
  start: IsoDate;
  end: IsoDate;
}

export interface SchoolCalendar {
  start: IsoDate;
  end: IsoDate;
  semester1: Semester;
  semester2: Semester;
}

/** Semester 2 runs this long; Semester 1 is the same, and the break sits between. */
const SEMESTER_WEEKS = 21;
/** How far into Semester 2 `today` should sit — just under half, so the midterm
 *  has been sat and the final has not. */
const POSITION_WEEKS = 10;
/** The mid-year break, long enough to be visible on a timetable. */
const BREAK_DAYS = 17;

/**
 * Builds a two-semester year positioned so that `today` falls near the middle
 * of Semester 2.
 *
 * The scenario being seeded — one semester finished and marked, the next half
 * taught — only holds if the calendar is anchored to the current date. Fixing
 * the dates in a constant would make the seed correct on the day it was written
 * and wrong on every day after, so the year is derived backwards from today
 * instead: place Semester 2 around today, then put Semester 1 and the break in
 * front of it.
 *
 * Everything snaps to a Monday start and a Friday end, because a term that
 * begins on a Wednesday produces a first week with three days in it and makes
 * every attendance total look wrong.
 */
export const calendarAround = (today: IsoDate): SchoolCalendar => {
  const secondStart = addDays(mondayOf(today), -weeks(POSITION_WEEKS));
  const secondEnd = addDays(secondStart, weeks(SEMESTER_WEEKS) - 3);

  const firstEnd = addDays(secondStart, -BREAK_DAYS);
  const firstStart = addDays(mondayOf(firstEnd), -weeks(SEMESTER_WEEKS));

  return {
    start: firstStart,
    end: secondEnd,
    semester1: { name: 'Semester 1', order: 1, start: firstStart, end: firstEnd },
    semester2: { name: 'Semester 2', order: 2, start: secondStart, end: secondEnd },
  };
};

/**
 * Moves a year's name back by one cycle, so "2025 - 2026" becomes "2024 - 2025".
 *
 * The archive shift is a whole number of years' worth of weeks, so the name has
 * to travel with the dates or the records end up filed under a year they no
 * longer occupy.
 */
export const shiftYearName = (name: string, years: number): string => {
  const parts = name.match(/(\d{4})\s*-\s*(\d{4})/);

  if (!parts) {
    return name;
  }

  return `${Number(parts[1]) - years} - ${Number(parts[2]) - years}`;
};
