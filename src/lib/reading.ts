import type { Book, LibraryData, ReadingSession, TargetWindow } from "../types";

const dayMs = 24 * 60 * 60 * 1000;

export function todayKey(): string {
  return formatDate(new Date());
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function dateFromIso(value: string): string {
  return value.slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export function daysBetween(start: string, end: string): number {
  return Math.floor((parseDate(end).getTime() - parseDate(start).getTime()) / dayMs);
}

export function daysBetweenInclusive(start: string, end: string): number {
  return Math.max(1, daysBetween(start, end) + 1);
}

export function clampPage(page: number, totalPages: number): number {
  return Math.max(0, Math.min(page, totalPages));
}

export function pagesForDate(sessions: ReadingSession[], date: string): number {
  return sessions
    .filter((session) => session.date === date)
    .reduce((total, session) => total + session.pagesRead, 0);
}

export function pagesForBookInRange(
  sessions: ReadingSession[],
  bookId: string,
  start: string,
  end: string,
): number {
  return sessions
    .filter(
      (session) =>
        session.bookId === bookId && session.date >= start && session.date <= end,
    )
    .reduce((total, session) => total + session.pagesRead, 0);
}

export function targetLabel(book: Book): string {
  switch (book.target.kind) {
    case "pagesPerDay":
      return `${book.target.pages} pages / day`;
    case "pagesEveryDays":
      return `${book.target.pages} pages every ${book.target.days} days`;
    case "pagesPerWeek":
      return `${book.target.pages} pages / week`;
    case "deadline":
      return `Finish by ${book.target.finishBy}`;
  }
}

export function targetWindow(
  book: Book,
  sessions: ReadingSession[],
  today = todayKey(),
): TargetWindow {
  const fallback = {
    start: today,
    end: today,
    targetPages: 0,
    pagesRead: 0,
    progress: 1,
    label: "Complete",
    windowLabel: "Finished",
  };

  if (book.currentPage >= book.totalPages) {
    return fallback;
  }

  const addedDate = dateFromIso(book.addedAt);
  let start = today;
  let end = today;
  let targetPages = 0;
  let windowLabel = "Today";

  switch (book.target.kind) {
    case "pagesPerDay":
      targetPages = book.target.pages;
      break;
    case "pagesEveryDays": {
      const intervalDays = Math.max(1, book.target.days);
      const elapsed = Math.max(0, daysBetween(addedDate, today));
      const intervalStartOffset = Math.floor(elapsed / intervalDays) * intervalDays;
      start = addDays(addedDate, intervalStartOffset);
      end = addDays(start, intervalDays - 1);
      targetPages = book.target.pages;
      windowLabel = `${start} to ${end}`;
      break;
    }
    case "pagesPerWeek": {
      const date = parseDate(today);
      const day = date.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      date.setDate(date.getDate() + mondayOffset);
      start = formatDate(date);
      end = addDays(start, 6);
      targetPages = book.target.pages;
      windowLabel = "This week";
      break;
    }
    case "deadline": {
      const pagesReadToday = pagesForBookInRange(sessions, book.id, today, today);
      const pagesStillPlanned = Math.max(
        0,
        book.totalPages - book.currentPage + pagesReadToday,
      );
      const daysLeft =
        parseDate(book.target.finishBy) < parseDate(today)
          ? 1
          : daysBetweenInclusive(today, book.target.finishBy);
      targetPages = Math.ceil(pagesStillPlanned / daysLeft);
      break;
    }
  }

  targetPages = Math.max(1, targetPages);

  const pagesRead = pagesForBookInRange(sessions, book.id, start, end);
  const progress = Math.min(1, pagesRead / targetPages);

  return {
    start,
    end,
    targetPages,
    pagesRead,
    progress,
    label: targetLabel(book),
    windowLabel,
  };
}

export function bookProgress(book: Book): number {
  if (book.totalPages <= 0) {
    return 0;
  }

  return Math.min(1, book.currentPage / book.totalPages);
}

export function lastDays(count: number, today = todayKey()): string[] {
  return Array.from({ length: count }, (_, index) => addDays(today, index - count + 1));
}

export function pagesByDate(sessions: ReadingSession[]): Record<string, number> {
  return sessions.reduce<Record<string, number>>((totals, session) => {
    totals[session.date] = (totals[session.date] ?? 0) + session.pagesRead;
    return totals;
  }, {});
}

export function currentStreak(sessions: ReadingSession[], today = todayKey()): number {
  const totals = pagesByDate(sessions);
  let streak = 0;
  let cursor = today;

  while ((totals[cursor] ?? 0) > 0) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function libraryStats(data: LibraryData): {
  activeBooks: number;
  finishedBooks: number;
  pagesToday: number;
  streak: number;
} {
  const today = todayKey();

  return {
    activeBooks: data.books.filter((book) => !book.finishedAt && book.shelf !== "readingList").length,
    finishedBooks: data.books.filter((book) => book.finishedAt).length,
    pagesToday: pagesForDate(data.sessions, today),
    streak: currentStreak(data.sessions, today),
  };
}
