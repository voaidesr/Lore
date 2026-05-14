export type ReadingTarget =
  | { kind: "pagesPerDay"; pages: number }
  | { kind: "pagesEveryDays"; pages: number; days: number }
  | { kind: "pagesPerWeek"; pages: number }
  | { kind: "deadline"; finishBy: string };

export type BookShelf = "active" | "readingList";

export type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  shelf: BookShelf;
  coverImage: string | null;
  pdfPath: string | null;
  totalPages: number;
  currentPage: number;
  target: ReadingTarget;
  addedAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

export type ReadingSession = {
  id: string;
  bookId: string;
  date: string;
  fromPage: number;
  toPage: number;
  pagesRead: number;
  createdAt: string;
};

export type LibraryData = {
  books: Book[];
  sessions: ReadingSession[];
};

export type TargetWindow = {
  start: string;
  end: string;
  targetPages: number;
  pagesRead: number;
  progress: number;
  label: string;
  windowLabel: string;
};

export const emptyLibrary: LibraryData = {
  books: [],
  sessions: [],
};
