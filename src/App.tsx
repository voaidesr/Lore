import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
  addDays,
  bookProgress,
  clampPage,
  currentStreak,
  dateFromIso,
  daysBetweenInclusive,
  isoNow,
  lastDays,
  libraryStats,
  pagesByDate,
  pagesForBookInRange,
  targetLabel,
  targetWindow,
  todayKey,
} from "./lib/reading";
import { loadLibrary, saveLibrary } from "./lib/storage";
import {
  emptyLibrary,
  type Book,
  type BookShelf,
  type LibraryData,
  type ReadingSession,
  type ReadingTarget,
} from "./types";

type Page = "home" | "library" | "book";
type TargetKind = ReadingTarget["kind"];
type ChartPeriod = "daily" | "weekly" | "monthly";
type QuotaTone = "empty" | "partial" | "met" | "exceed";

type BookFormState = {
  title: string;
  author: string;
  category: string;
  shelf: BookShelf;
  coverImage: string;
  pdfPath: string;
  totalPages: string;
  currentPage: string;
  targetKind: TargetKind;
  pages: string;
  days: string;
  finishBy: string;
};

type TargetFormState = Pick<BookFormState, "targetKind" | "pages" | "days" | "finishBy">;

type StartReadingFormState = TargetFormState & {
  currentPage: string;
};

type GoalWindow = {
  label: string;
  start: string;
  end: string;
  targetPages: number;
  pagesRead: number;
  progress: number;
};

const unsortedCategory = "Unsorted";

const targetOptions: Array<{ kind: TargetKind; label: string; help: string }> = [
  { kind: "pagesPerDay", label: "Daily", help: "X pages per day" },
  { kind: "pagesEveryDays", label: "Cadence", help: "X pages every Y days" },
  { kind: "pagesPerWeek", label: "Weekly", help: "X pages per week" },
  { kind: "deadline", label: "Deadline", help: "Calculate the daily pace" },
];

const defaultBookForm = (): BookFormState => ({
  title: "",
  author: "",
  category: "",
  shelf: "active",
  coverImage: "",
  pdfPath: "",
  totalPages: "",
  currentPage: "0",
  targetKind: "pagesPerDay",
  pages: "25",
  days: "2",
  finishBy: addDays(todayKey(), 30),
});

const defaultStartReadingForm = (): StartReadingFormState => ({
  currentPage: "0",
  targetKind: "pagesPerDay",
  pages: "25",
  days: "2",
  finishBy: addDays(todayKey(), 30),
});

function App() {
  const [library, setLibrary] = useState<LibraryData>(emptyLibrary);
  const [isLoaded, setIsLoaded] = useState(false);
  const [canPersist, setCanPersist] = useState(false);
  const [saveState, setSaveState] = useState("Loading library");
  const [page, setPage] = useState<Page>("home");
  const [form, setForm] = useState<BookFormState>(defaultBookForm);
  const [formError, setFormError] = useState("");
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [isBookPanelOpen, setIsBookPanelOpen] = useState(false);
  const [isStartPanelOpen, setIsStartPanelOpen] = useState(false);
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [startForm, setStartForm] = useState<StartReadingFormState>(defaultStartReadingForm);
  const [startError, setStartError] = useState("");
  const [selectedBookId, setSelectedBookId] = useState("");
  const [progressPage, setProgressPage] = useState("");
  const [progressError, setProgressError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [milestone, setMilestone] = useState("");

  useEffect(() => {
    let active = true;

    loadLibrary()
      .then((data) => {
        if (!active) {
          return;
        }

        setLibrary({
          books: (data.books ?? []).map(normalizeBook),
          sessions: data.sessions ?? [],
        });
        setCanPersist(true);
        setIsLoaded(true);
        setSaveState("Library loaded");
      })
      .catch((error: unknown) => {
        setCanPersist(false);
        setSaveState(error instanceof Error ? error.message : String(error));
        setIsLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !canPersist) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSaveState("Saving");
      saveLibrary(library)
        .then(() => setSaveState("Saved locally"))
        .catch((error: unknown) =>
          setSaveState(error instanceof Error ? error.message : String(error)),
        );
    }, 160);

    return () => window.clearTimeout(timeout);
  }, [canPersist, isLoaded, library]);

  const categories = useMemo(() => categoriesFor(library.books), [library.books]);
  const stats = useMemo(() => libraryStats(library), [library]);
  const sortedBooks = useMemo(() => sortBooks(library.books), [library.books]);
  const activeBooks = useMemo(
    () => sortedBooks.filter(isActiveBook),
    [sortedBooks],
  );
  const selectedBook = library.books.find((book) => book.id === selectedBookId);
  const selectedActiveBook = activeBooks.find((book) => book.id === selectedBookId);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (library.books.length === 0) {
      setSelectedBookId("");
      return;
    }

    if (!library.books.some((book) => book.id === selectedBookId)) {
      const nextBook = library.books.find(isActiveBook) ?? library.books.find(isReadingListBook) ?? library.books[0];
      setSelectedBookId(nextBook.id);
    }
  }, [isLoaded, library.books, selectedBookId]);

  useEffect(() => {
    setProgressPage(selectedActiveBook ? String(selectedActiveBook.currentPage) : "");
  }, [selectedActiveBook]);

  function openBook(bookId: string) {
    setSelectedBookId(bookId);
    setPage("book");
  }

  function beginLogPages(bookId?: string) {
    const requestedBook = bookId ? activeBooks.find((book) => book.id === bookId) : undefined;

    if (requestedBook) {
      setSelectedBookId(requestedBook.id);
      setProgressPage(String(requestedBook.currentPage));
    } else if (!activeBooks.some((book) => book.id === selectedBookId)) {
      const firstActive = activeBooks[0];
      if (firstActive) {
        setSelectedBookId(firstActive.id);
        setProgressPage(String(firstActive.currentPage));
      }
    }

    setProgressError("");
    setIsLogPanelOpen(true);
  }

  async function choosePdfPath() {
    try {
      if (!isTauri()) {
        setFormError("PDF file picking is available in the desktop app.");
        return;
      }

      const selected = await open({
        multiple: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });

      if (typeof selected === "string") {
        updateForm("pdfPath", selected);
        setFormError("");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error));
    }
  }

  async function openPdfInOkular(book: Book) {
    if (!book.pdfPath) {
      return;
    }

    if (!isTauri()) {
      setMilestone("Opening PDFs in Okular is available in the desktop app.");
      return;
    }

    try {
      await invoke("open_pdf_in_okular", { path: book.pdfPath });
      setMilestone(`Opened PDF for ${book.title}`);
    } catch (error) {
      setMilestone(error instanceof Error ? error.message : String(error));
    }
  }

  function updateForm(field: keyof BookFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateStartForm(field: keyof StartReadingFormState, value: string) {
    setStartForm((current) => ({ ...current, [field]: value }));
  }

  function handleBookSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = form.title.trim();
    const author = form.author.trim();
    const category = normalizeCategory(form.category);
    const shelf = form.shelf;
    const totalPages = positiveInteger(form.totalPages);
    const currentPage =
      shelf === "readingList" ? 0 : clampPage(Math.round(Number(form.currentPage) || 0), totalPages);
    const target = shelf === "readingList" ? defaultReadingTarget() : targetFromForm(form);

    if (!title || !author) {
      setFormError("Title and author are required.");
      return;
    }

    if (totalPages <= 0) {
      setFormError("Total pages must be a positive number.");
      return;
    }

    if (shelf === "active" && !target) {
      setFormError("Set a valid reading target.");
      return;
    }

    const now = isoNow();
    const coverImage = form.coverImage.trim() || null;
    const pdfPath = form.pdfPath.trim() || null;
    const resolvedTarget = target ?? defaultReadingTarget();

    if (editingBookId) {
      setLibrary((current) => ({
        ...current,
        books: current.books.map((book) =>
          book.id === editingBookId
            ? {
                ...book,
                title,
                author,
                category,
                shelf,
                coverImage,
                pdfPath,
                totalPages,
                currentPage,
                target: resolvedTarget,
                updatedAt: now,
                finishedAt: shelf === "active" && currentPage >= totalPages ? book.finishedAt ?? now : null,
              }
            : book,
        ),
      }));
      setMilestone(shelf === "readingList" ? "Book moved to reading list" : "Book updated");
    } else {
      const book: Book = {
        id: createId(),
        title,
        author,
        category,
        shelf,
        coverImage,
        pdfPath,
        totalPages,
        currentPage,
        target: resolvedTarget,
        addedAt: now,
        updatedAt: now,
        finishedAt: shelf === "active" && currentPage >= totalPages ? now : null,
      };

      setLibrary((current) => ({
        ...current,
        books: [book, ...current.books],
      }));
      setSelectedBookId(book.id);
      setMilestone(shelf === "readingList" ? "Book added to reading list" : "Book added");
    }

    setEditingBookId(null);
    setIsBookPanelOpen(false);
    setForm(defaultBookForm());
    setFormError("");
  }

  function beginAddBook() {
    setEditingBookId(null);
    setForm(defaultBookForm());
    setFormError("");
    setIsBookPanelOpen(true);
  }

  function beginEdit(book: Book) {
    setEditingBookId(book.id);
    setForm(formFromBook(book));
    setFormError("");
    setIsBookPanelOpen(true);
  }

  function beginStartReading(book: Book) {
    setSelectedBookId(book.id);
    setStartForm(startReadingFormFromBook(book));
    setStartError("");
    setIsStartPanelOpen(true);
  }

  function cancelStartReading() {
    setIsStartPanelOpen(false);
    setStartForm(defaultStartReadingForm());
    setStartError("");
  }

  function handleStartReadingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBook || !isReadingListBook(selectedBook)) {
      setStartError("Choose a book from the reading list first.");
      return;
    }

    const target = targetFromForm(startForm);
    if (!target) {
      setStartError("Set a valid reading target.");
      return;
    }

    const currentPage = clampPage(Math.round(Number(startForm.currentPage) || 0), selectedBook.totalPages);
    const now = isoNow();

    setLibrary((current) => ({
      ...current,
      books: current.books.map((book) =>
        book.id === selectedBook.id
          ? {
              ...book,
              shelf: "active",
              currentPage,
              target,
              updatedAt: now,
              finishedAt: currentPage >= book.totalPages ? now : null,
            }
          : book,
      ),
    }));
    setCategoryFilter("All");
    setIsStartPanelOpen(false);
    setStartForm(defaultStartReadingForm());
    setStartError("");
    setMilestone(`Started ${selectedBook.title}`);
  }

  function cancelEdit() {
    setEditingBookId(null);
    setIsBookPanelOpen(false);
    setForm(defaultBookForm());
    setFormError("");
  }

  function logProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedBook) {
      setProgressError("Choose a book first.");
      return;
    }

    if (!isActiveBook(selectedBook)) {
      setProgressError("Start this book before logging pages.");
      return;
    }

    if (selectedBook.finishedAt) {
      setProgressError("This book is already finished.");
      return;
    }

    const requestedPage = Math.round(Number(progressPage));
    if (!Number.isFinite(requestedPage)) {
      setProgressError("Enter a valid page number.");
      return;
    }

    const toPage = clampPage(requestedPage, selectedBook.totalPages);
    if (toPage < selectedBook.currentPage) {
      setProgressError("Progress entries cannot move backwards. Edit the book to correct a page.");
      return;
    }

    const pagesRead = toPage - selectedBook.currentPage;
    if (pagesRead === 0) {
      setProgressError("No new pages to record.");
      return;
    }

    const now = isoNow();
    const date = todayKey();
    const session: ReadingSession = {
      id: createId(),
      bookId: selectedBook.id,
      date,
      fromPage: selectedBook.currentPage,
      toPage,
      pagesRead,
      createdAt: now,
    };

    setLibrary((current) => {
      const nextSessions = [session, ...current.sessions];
      const nextBooks = current.books.map((book) =>
        book.id === selectedBook.id
          ? {
              ...book,
              currentPage: toPage,
              updatedAt: now,
              finishedAt: toPage >= book.totalPages ? book.finishedAt ?? now : null,
            }
          : book,
      );
      const nextBook = nextBooks.find((book) => book.id === selectedBook.id);

      if (nextBook?.finishedAt && !selectedBook.finishedAt) {
        setMilestone(`Finished ${nextBook.title}`);
      } else if (nextBook && targetWindow(nextBook, nextSessions).progress >= 1) {
        setMilestone(`Target reached for ${nextBook.title}`);
      } else {
        setMilestone(`${pagesRead} pages logged`);
      }

      return {
        books: nextBooks,
        sessions: nextSessions,
      };
    });

    setProgressError("");
    setIsLogPanelOpen(false);
  }

  function deleteLog(sessionId: string) {
    setLibrary((current) => {
      const deletedSession = current.sessions.find((session) => session.id === sessionId);
      if (!deletedSession) {
        return current;
      }

      const nextSessions = current.sessions.filter((session) => session.id !== sessionId);
      const now = isoNow();
      const nextBooks = current.books.map((book) => {
        if (book.id !== deletedSession.bookId) {
          return book;
        }

        return recalculateBookAfterLogDelete(book, deletedSession, nextSessions, now);
      });

      const affectedBook = nextBooks.find((book) => book.id === deletedSession.bookId);
      if (affectedBook) {
        setMilestone(`Deleted log for ${affectedBook.title}`);
      }

      return {
        books: nextBooks,
        sessions: nextSessions,
      };
    });
  }

  const pageTitle =
    page === "home" ? "Reading desk" : page === "library" ? "Library" : selectedBook?.title ?? "Book";

  return (
    <main className="min-h-screen bg-charcoal text-parchment">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-7 px-5 py-6 sm:px-8 lg:px-10">
        <header className="grid gap-5 border-b border-white/10 pb-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs uppercase text-brass">Private reading ledger</p>
            <h1 className="mt-2 font-display text-5xl leading-none text-parchment">Lore</h1>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <nav className="flex rounded-md border border-white/10 bg-night p-1">
              <NavButton active={page === "home"} label="Home" onClick={() => setPage("home")} />
              <NavButton active={page === "library"} label="Library" onClick={() => setPage("library")} />
            </nav>
            <div className="flex flex-wrap justify-start gap-3 text-sm text-faded lg:justify-end">
              <span>{pageTitle}</span>
              <span>{saveState}</span>
              <span>{new Date().toLocaleDateString()}</span>
              <button
                className="text-faded underline-offset-4 transition hover:text-brass hover:underline"
                onClick={() => setIsHistoryPanelOpen(true)}
                type="button"
              >
                history
              </button>
            </div>
          </div>
        </header>

        {milestone ? (
          <div className="milestone-glow rounded-md border border-brass/50 bg-brass/10 px-4 py-3 text-sm text-parchment">
            {milestone}
          </div>
        ) : null}

        {page === "home" ? (
          <HomePage
            activeBooks={activeBooks}
            library={library}
            stats={stats}
            onLogPages={beginLogPages}
            onOpenBook={openBook}
          />
        ) : null}

        {page === "library" ? (
          <LibraryPage
            books={sortedBooks}
            categories={categories}
            categoryFilter={categoryFilter}
            sessions={library.sessions}
            onAddBook={beginAddBook}
            onCategoryFilterChange={setCategoryFilter}
            onOpenBook={openBook}
          />
        ) : null}

        {page === "book" ? (
          <BookDetailPage
            book={selectedBook}
            sessions={library.sessions}
            onBack={() => setPage("library")}
            onEdit={beginEdit}
            onOpenPdf={openPdfInOkular}
            onStartReading={beginStartReading}
          />
        ) : null}

        {isBookPanelOpen ? (
          <SidePanel onClose={cancelEdit}>
            <BookForm
              categories={categories}
              editingBookId={editingBookId}
              form={form}
              formError={formError}
              onCancelEdit={cancelEdit}
              onChoosePdf={choosePdfPath}
              onSubmit={handleBookSubmit}
              onUpdate={updateForm}
            />
          </SidePanel>
        ) : null}

        {isLogPanelOpen ? (
          <SidePanel onClose={() => setIsLogPanelOpen(false)}>
            <ProgressLogger
              activeBooks={activeBooks}
              progressError={progressError}
              progressPage={progressPage}
              selectedBook={selectedActiveBook}
              selectedBookId={selectedBookId}
              sessions={library.sessions}
              onLogProgress={logProgress}
              onProgressPageChange={setProgressPage}
              onSelectedBookChange={setSelectedBookId}
            />
          </SidePanel>
        ) : null}

        {isStartPanelOpen ? (
          <SidePanel onClose={cancelStartReading}>
            <StartReadingForm
              book={selectedBook}
              form={startForm}
              formError={startError}
              onCancel={cancelStartReading}
              onSubmit={handleStartReadingSubmit}
              onUpdate={updateStartForm}
            />
          </SidePanel>
        ) : null}

        {isHistoryPanelOpen ? (
          <SidePanel onClose={() => setIsHistoryPanelOpen(false)}>
            <LogHistory books={library.books} sessions={library.sessions} onDeleteLog={deleteLog} />
          </SidePanel>
        ) : null}
      </div>
    </main>
  );
}

function HomePage({
  activeBooks,
  library,
  stats,
  onLogPages,
  onOpenBook,
}: {
  activeBooks: Book[];
  library: LibraryData;
  stats: ReturnType<typeof libraryStats>;
  onLogPages: (bookId?: string) => void;
  onOpenBook: (bookId: string) => void;
}) {
  const totalPages = library.sessions.reduce((sum, session) => sum + session.pagesRead, 0);
  const readingDays = Object.values(pagesByDate(library.sessions)).filter((pages) => pages > 0).length;
  const averagePages = readingDays ? Math.round(totalPages / readingDays) : 0;
  const pendingTasks = activeBooks
    .map((book) => {
      const target = targetWindow(book, library.sessions);
      return {
        book,
        target,
        remaining: Math.max(0, target.targetPages - target.pagesRead),
      };
    })
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 5);
  const todayTone = quotaTone(stats.pagesToday > 0 ? 1 : 0);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Pages today" tone={todayTone} value={stats.pagesToday} />
          <Stat label="Current streak" tone={quotaTone(stats.streak > 0 ? 1 : 0)} value={`${stats.streak}d`} />
          <Stat label="Pages logged" value={totalPages} />
          <Stat label="Avg / reading day" tone={quotaTone(averagePages > 0 ? 1 : 0)} value={averagePages} />
        </div>

        <section className="rounded-md border border-white/10 bg-night p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase text-faded">Progress entry</p>
              <h2 className="mt-1 font-display text-3xl text-parchment">Today&apos;s reading</h2>
              <p className="mt-2 text-sm text-faded">
                {activeBooks.length
                  ? `${activeBooks.length} active books are available for quick logging.`
                  : "Add an active book in the Library to begin logging pages."}
              </p>
            </div>
            <button
              className="h-10 rounded-md bg-brass px-4 text-sm font-semibold text-charcoal transition hover:bg-[#d6b66d] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!activeBooks.length}
              onClick={() => onLogPages()}
              type="button"
            >
              Log pages
            </button>
          </div>
        </section>

        <PendingTasks tasks={pendingTasks} onLogBook={onLogPages} />

        <section className="rounded-md border border-white/10 bg-night p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase text-faded">Evolution</p>
              <h2 className="mt-1 font-display text-3xl text-parchment">Reading pages</h2>
            </div>
            <p className="text-sm text-faded">{totalPages} total</p>
          </div>
          <ReadingEvolutionChart sessions={library.sessions} />
        </section>

        <section className="rounded-md border border-white/10 bg-night p-5">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase text-faded">Currently reading</p>
              <h2 className="mt-1 font-display text-3xl text-parchment">Recent volumes</h2>
            </div>
            <p className="text-sm text-faded">{activeBooks.length} active</p>
          </div>
          <RecentBooks books={activeBooks.slice(0, 6)} onOpenBook={onOpenBook} />
        </section>
      </section>

      <aside className="grid content-start gap-5">
        <Heatmap range={90} sessions={library.sessions} streak={currentStreak(library.sessions)} />
      </aside>
    </div>
  );
}

function ProgressLogger({
  activeBooks,
  progressError,
  progressPage,
  selectedBook,
  selectedBookId,
  sessions,
  onLogProgress,
  onProgressPageChange,
  onSelectedBookChange,
}: {
  activeBooks: Book[];
  progressError: string;
  progressPage: string;
  selectedBook: Book | undefined;
  selectedBookId: string;
  sessions: ReadingSession[];
  onLogProgress: (event: FormEvent<HTMLFormElement>) => void;
  onProgressPageChange: (value: string) => void;
  onSelectedBookChange: (value: string) => void;
}) {
  const target = selectedBook ? targetWindow(selectedBook, sessions) : null;
  const sessionPages = selectedBook ? Math.max(0, Number(progressPage || 0) - selectedBook.currentPage) : 0;

  return (
    <form className="grid gap-4" onSubmit={onLogProgress}>
      <div>
        <p className="text-sm uppercase text-faded">Log pages</p>
        <h2 className="mt-1 font-display text-3xl text-parchment">Progress entry</h2>
      </div>
      <div className="grid gap-2">
        <p className="text-sm text-faded">Book</p>
        <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
          {activeBooks.length ? (
            activeBooks.map((book) => (
              <button
                key={book.id}
                className={`rounded-md border px-3 py-3 text-left transition ${
                  selectedBookId === book.id
                    ? "border-brass bg-brass/10 text-parchment"
                    : "border-white/10 bg-slate text-faded hover:border-brass hover:text-parchment"
                }`}
                onClick={() => onSelectedBookChange(book.id)}
                type="button"
              >
                <span className="block truncate font-display text-lg text-parchment">{book.title}</span>
                <span className="mt-1 block truncate text-xs">{book.author}</span>
              </button>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-white/15 bg-slate/60 p-4 text-sm text-faded">
              Add an active book from the Library page.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="grid max-w-xs gap-2 text-sm text-faded">
          Current page
          <input
            className="h-11 w-full rounded-md border border-white/10 bg-slate px-3 text-parchment outline-none transition placeholder:text-faded focus:border-brass"
            min={selectedBook?.currentPage ?? 0}
            max={selectedBook?.totalPages ?? undefined}
            type="number"
            value={progressPage}
            onChange={(event) => onProgressPageChange(event.currentTarget.value)}
          />
        </label>
        <button
          className="h-11 w-full rounded-md bg-brass px-5 text-sm font-semibold text-charcoal transition hover:bg-[#d6b66d] disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          disabled={!selectedBook}
          type="submit"
        >
          Log pages
        </button>
      </div>

      <p className="min-h-6 text-sm text-faded">
        {selectedBook?.finishedAt ? (
          "Finished. Edit the book if you need to adjust the record."
        ) : selectedBook && target ? (
          <>
            {sessionPages > 0 ? `${sessionPages} pages this session. ` : ""}
            {target.pagesRead}/{target.targetPages} pages toward {target.windowLabel.toLowerCase()} target.
          </>
        ) : (
          "Choose a book to begin."
        )}
        {progressError ? <span className="ml-2 text-brass">{progressError}</span> : null}
      </p>
    </form>
  );
}

function LibraryPage({
  books,
  categories,
  categoryFilter,
  sessions,
  onAddBook,
  onCategoryFilterChange,
  onOpenBook,
}: {
  books: Book[];
  categories: string[];
  categoryFilter: string;
  sessions: ReadingSession[];
  onAddBook: () => void;
  onCategoryFilterChange: (category: string) => void;
  onOpenBook: (bookId: string) => void;
}) {
  const isArchive = categoryFilter === "Archive";
  const isReadingList = categoryFilter === "Reading list";
  const shelfBooks = books.filter((book) => {
    if (isArchive) {
      return Boolean(book.finishedAt);
    }

    if (isReadingList) {
      return isReadingListBook(book);
    }

    if (book.finishedAt) {
      return false;
    }

    if (isReadingListBook(book)) {
      return false;
    }

    return categoryFilter === "All" || book.category === categoryFilter;
  });

  return (
    <div className="grid gap-8">
      <section className="grid gap-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm uppercase text-faded">Library</p>
              <h2 className="mt-1 font-display text-3xl text-parchment">The shelves</h2>
              <p className="mt-2 text-sm text-faded">Open a book directly from the shelf for details.</p>
            </div>
            <button
              className="h-10 rounded-md border border-brass/70 px-4 text-sm text-brass transition hover:bg-brass hover:text-charcoal"
              onClick={onAddBook}
              type="button"
            >
              Add book
            </button>
          </div>

          <CategoryChips
            activeCategory={categoryFilter}
            categories={["All", "Reading list", "Archive", ...categories]}
            onChange={onCategoryFilterChange}
          />
        </div>

        {shelfBooks.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/15 bg-slate/60 p-8 text-center text-faded">
            {isArchive
              ? "No finished books yet."
              : isReadingList
                ? "No books are waiting in the reading list."
                : "No books match this shelf."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {shelfBooks.map((book) => (
              <SquareBookCard
                archived={isArchive}
                readingList={isReadingList}
                key={book.id}
                book={book}
                sessions={sessions}
                onOpen={onOpenBook}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BookDetailPage({
  book,
  sessions,
  onBack,
  onEdit,
  onOpenPdf,
  onStartReading,
}: {
  book: Book | undefined;
  sessions: ReadingSession[];
  onBack: () => void;
  onEdit: (book: Book) => void;
  onOpenPdf: (book: Book) => void;
  onStartReading: (book: Book) => void;
}) {
  if (!book) {
    return (
      <section className="rounded-md border border-white/10 bg-night p-8 text-center text-faded">
        Choose a book from the Library.
      </section>
    );
  }

  if (isReadingListBook(book)) {
    return (
      <ReadingListBookDetail
        book={book}
        onBack={onBack}
        onEdit={onEdit}
        onOpenPdf={onOpenPdf}
        onStartReading={onStartReading}
      />
    );
  }

  const analytics = bookAnalytics(book, sessions);
  const bookSessions = sessions.filter((session) => session.bookId === book.id);
  const target = targetWindow(book, sessions);
  const cover = resolveCoverSource(book.coverImage);

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-md border border-white/10 bg-night p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="grid gap-4 rounded-md border border-white/10 bg-slate p-4 sm:grid-cols-[128px_minmax(0,1fr)]">
          <div className="book-detail-cover grid aspect-square place-items-center overflow-hidden rounded-md bg-charcoal">
            {cover ? (
              <BookArtwork alt={`${book.title} cover`} cover={cover} size="large" />
            ) : (
              <div className="p-4 text-center">
                <h2 className="fit-title font-display text-parchment">{book.title}</h2>
                <p className="mt-2 text-sm text-faded">{book.author}</p>
              </div>
            )}
          </div>

          <div className="grid min-w-0 content-between gap-4">
            <div className="min-w-0">
              <button className="mb-3 text-sm text-faded transition hover:text-brass" onClick={onBack} type="button">
                Back to library
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-brass/40 px-2 py-1 text-xs uppercase text-brass">
                  {book.category}
                </span>
                <span className="text-xs text-faded">{targetLabel(book)}</span>
              </div>
              <h2 className="mt-3 truncate font-display text-4xl leading-tight text-parchment">{book.title}</h2>
              <p className="mt-1 truncate text-faded">{book.author}</p>
            </div>

            <div>
              <ThinProgress value={bookProgress(book)} />
              <div className="mt-2 flex justify-between text-xs text-faded">
                <span>Page {book.currentPage}</span>
                <span>{Math.round(bookProgress(book) * 100)}% · {book.totalPages} pages</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="h-9 rounded-md border border-white/10 px-4 text-sm text-parchment transition hover:border-brass hover:text-brass"
                  onClick={() => onEdit(book)}
                  type="button"
                >
                  Edit book
                </button>
                {book.pdfPath ? (
                  <button
                    className="text-xs text-faded underline-offset-4 transition hover:text-brass hover:underline"
                    onClick={() => onOpenPdf(book)}
                    type="button"
                  >
                    open in Okular
                  </button>
                ) : null}
              </div>
              {book.pdfPath ? (
                <p className="mt-2 truncate text-xs text-faded" title={book.pdfPath}>
                  PDF attached
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Pages today" tone={quotaTone(analytics.pagesToday / Math.max(1, target.targetPages))} value={analytics.pagesToday} />
          <Stat label="Pages left" tone={quotaTone(analytics.pagesRemaining === 0 ? 1 : 0.55)} value={analytics.pagesRemaining} />
          <Stat label="Goal meet rate" tone={quotaTone(analytics.goalMeetRate / 100)} value={`${analytics.goalMeetRate}%`} />
          <Stat label="Best day" tone={quotaTone(analytics.bestDayPages / Math.max(1, target.targetPages))} value={analytics.bestDayPages} />
        </div>
      </section>

      <section className="grid gap-4">
        <div className="rounded-md border border-white/10 bg-night p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase text-faded">Goal cadence</p>
              <h3 className="mt-1 font-display text-3xl text-parchment">Target graph</h3>
            </div>
            <ProgressRing progress={target.progress} />
          </div>
          <GoalGrid windows={analytics.goalWindows} />

          <dl className="mt-4 grid gap-3 border-t border-white/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="This window" value={`${target.pagesRead}/${target.targetPages} pages`} />
            <Metric label="Average session" value={`${analytics.averageSessionPages} pages`} />
            <Metric label="Reading days" value={`${analytics.readingDays}`} />
            <Metric label="Sessions" value={`${analytics.sessionCount}`} />
            <Metric label="Estimated finish" value={analytics.estimatedFinish} />
          </dl>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-md border border-white/10 bg-night p-4">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase text-faded">Book activity</p>
              <h3 className="mt-1 font-display text-3xl text-parchment">Pages by day</h3>
            </div>
            <p className="text-sm text-faded">{analytics.pagesRecorded} pages</p>
          </div>
          <PagesBarChart sessions={bookSessions} />
        </div>

        <div className="rounded-md border border-white/10 bg-night p-4">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm uppercase text-faded">Consistency</p>
              <h3 className="mt-1 font-display text-3xl text-parchment">Book heatmap</h3>
            </div>
            <p className="text-sm text-faded">{analytics.currentBookStreak}d</p>
          </div>
          <Heatmap compact range={90} sessions={bookSessions} streak={analytics.currentBookStreak} />
        </div>
      </section>
    </div>
  );
}

function ReadingListBookDetail({
  book,
  onBack,
  onEdit,
  onOpenPdf,
  onStartReading,
}: {
  book: Book;
  onBack: () => void;
  onEdit: (book: Book) => void;
  onOpenPdf: (book: Book) => void;
  onStartReading: (book: Book) => void;
}) {
  const cover = resolveCoverSource(book.coverImage);

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-md border border-white/10 bg-night p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-4 rounded-md border border-white/10 bg-slate p-4 sm:grid-cols-[148px_minmax(0,1fr)]">
          <div className="book-detail-cover grid aspect-square place-items-center overflow-hidden rounded-md bg-charcoal">
            {cover ? (
              <BookArtwork alt={`${book.title} cover`} cover={cover} size="large" />
            ) : (
              <div className="p-4 text-center">
                <h2 className="fit-title font-display text-parchment">{book.title}</h2>
                <p className="mt-2 text-sm text-faded">{book.author}</p>
              </div>
            )}
          </div>

          <div className="grid min-w-0 content-between gap-5">
            <div className="min-w-0">
              <button className="mb-3 text-sm text-faded transition hover:text-brass" onClick={onBack} type="button">
                Back to library
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-brass/40 px-2 py-1 text-xs uppercase text-brass">
                  Reading list
                </span>
                <span className="rounded border border-white/10 px-2 py-1 text-xs uppercase text-faded">
                  {book.category}
                </span>
              </div>
              <h2 className="mt-3 font-display text-4xl leading-tight text-parchment">{book.title}</h2>
              <p className="mt-1 text-faded">{book.author}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="h-10 rounded-md bg-brass px-4 text-sm font-semibold text-charcoal transition hover:bg-[#d6b66d]"
                onClick={() => onStartReading(book)}
                type="button"
              >
                Start reading
              </button>
              <button
                className="h-10 rounded-md border border-white/10 px-4 text-sm text-parchment transition hover:border-brass hover:text-brass"
                onClick={() => onEdit(book)}
                type="button"
              >
                Edit book
              </button>
              {book.pdfPath ? (
                <button
                  className="text-xs text-faded underline-offset-4 transition hover:text-brass hover:underline"
                  onClick={() => onOpenPdf(book)}
                  type="button"
                >
                  open in Okular
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-3 rounded-md border border-white/10 bg-slate p-4">
          <Metric label="Status" value="Waiting to start" />
          <Metric label="Pages" value={`${book.totalPages}`} />
          <Metric label="Added" value={displayDate(book.addedAt)} />
          <Metric label="PDF" value={book.pdfPath ? "Attached" : "None"} />
        </aside>
      </section>

      <section className="rounded-md border border-white/10 bg-night p-5">
        <p className="text-sm uppercase text-faded">Next step</p>
        <h3 className="mt-1 font-display text-3xl text-parchment">Set a target when you are ready</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-faded">
          Reading-list books stay out of daily tasks and progress logging until you start them.
        </p>
      </section>
    </div>
  );
}

function SidePanel({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid justify-items-end bg-black/60 backdrop-blur-sm">
      <button className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <aside className="relative h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-night p-5 shadow-2xl shadow-black">
        <div className="mb-4 flex justify-end">
          <button className="text-sm text-faded transition hover:text-brass" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function LogHistory({
  books,
  sessions,
  onDeleteLog,
}: {
  books: Book[];
  sessions: ReadingSession[];
  onDeleteLog: (sessionId: string) => void;
}) {
  const bookById = useMemo(
    () => new Map(books.map((book) => [book.id, book])),
    [books],
  );
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const created = b.createdAt.localeCompare(a.createdAt);
        return created === 0 ? b.date.localeCompare(a.date) : created;
      }),
    [sessions],
  );

  function confirmDelete(session: ReadingSession) {
    const book = bookById.get(session.bookId);
    const label = book ? `${book.title}: ${session.pagesRead} pages` : `${session.pagesRead} pages`;
    if (window.confirm(`Delete this log?\n\n${label}`)) {
      onDeleteLog(session.id);
    }
  }

  return (
    <section className="grid gap-4">
      <div>
        <p className="text-sm uppercase text-faded">History</p>
        <h2 className="mt-1 font-display text-3xl text-parchment">Reading logs</h2>
        <p className="mt-2 text-sm leading-6 text-faded">
          Delete mistaken entries quietly. The affected book page will be recalculated from the remaining logs.
        </p>
      </div>

      {sortedSessions.length ? (
        <div className="grid gap-2">
          {sortedSessions.map((session) => {
            const book = bookById.get(session.bookId);

            return (
              <article key={session.id} className="rounded-md border border-white/10 bg-slate p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg text-parchment">
                      {book?.title ?? "Deleted book"}
                    </p>
                    <p className="mt-1 text-xs text-faded">
                      {displayDate(session.createdAt)} · pages {session.fromPage} to {session.toPage}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-charcoal px-2 py-1 text-xs text-brass">
                    +{session.pagesRead}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="truncate text-xs text-faded">{book?.author ?? session.date}</p>
                  <button
                    className="text-xs text-faded transition hover:text-brass"
                    onClick={() => confirmDelete(session)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-white/15 bg-slate/50 p-5 text-sm text-faded">
          No reading logs yet.
        </p>
      )}
    </section>
  );
}

function BookForm({
  categories,
  editingBookId,
  form,
  formError,
  onCancelEdit,
  onChoosePdf,
  onSubmit,
  onUpdate,
}: {
  categories: string[];
  editingBookId: string | null;
  form: BookFormState;
  formError: string;
  onCancelEdit: () => void;
  onChoosePdf: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (field: keyof BookFormState, value: string) => void;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-night p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-faded">{editingBookId ? "Editing" : "New volume"}</p>
          <h2 className="mt-1 font-display text-3xl text-parchment">
            {editingBookId ? "Refine the record" : "Add a book"}
          </h2>
        </div>
        {editingBookId ? (
          <button className="text-sm text-faded transition hover:text-parchment" onClick={onCancelEdit} type="button">
            Cancel
          </button>
        ) : null}
      </div>

      <form className="grid gap-4" onSubmit={onSubmit}>
        <TextField label="Title" value={form.title} onChange={(value) => onUpdate("title", value)} />
        <TextField label="Author" value={form.author} onChange={(value) => onUpdate("author", value)} />
        <TextField label="Category" value={form.category} onChange={(value) => onUpdate("category", value)} />
        {categories.length ? (
          <div className="flex flex-wrap gap-2">
            {categories.slice(0, 8).map((category) => (
              <button
                key={category}
                className="rounded border border-white/10 px-2.5 py-1 text-xs text-faded transition hover:border-brass hover:text-brass"
                onClick={() => onUpdate("category", category)}
                type="button"
              >
                {category}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-2">
          <p className="text-sm text-faded">Shelf</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              ["active", "Currently reading", "Track goals and pages now"],
              ["readingList", "Reading list", "Save it for later"],
            ] as Array<[BookShelf, string, string]>).map(([shelf, label, help]) => (
              <button
                key={shelf}
                className={`rounded-md border px-3 py-3 text-left transition ${
                  form.shelf === shelf
                    ? "border-brass bg-brass/10 text-parchment"
                    : "border-white/10 bg-slate text-faded hover:border-brass hover:text-parchment"
                }`}
                onClick={() => onUpdate("shelf", shelf)}
                type="button"
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-1 block text-xs">{help}</span>
              </button>
            ))}
          </div>
        </div>
        <TextField
          label="Cover URL or local path"
          value={form.coverImage}
          onChange={(value) => onUpdate("coverImage", value)}
        />
        <div className="grid gap-2">
          <TextField label="PDF path" value={form.pdfPath} onChange={(value) => onUpdate("pdfPath", value)} />
          <div className="flex flex-wrap gap-2">
            <button
              className="h-9 rounded-md border border-white/10 bg-slate px-3 text-sm text-faded transition hover:border-brass hover:text-parchment"
              onClick={onChoosePdf}
              type="button"
            >
              Find PDF
            </button>
            {form.pdfPath ? (
              <button
                className="h-9 rounded-md border border-white/10 px-3 text-sm text-faded transition hover:border-brass hover:text-brass"
                onClick={() => onUpdate("pdfPath", "")}
                type="button"
              >
                Clear PDF
              </button>
            ) : null}
          </div>
        </div>

        <div className={form.shelf === "active" ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
          <TextField
            label="Total pages"
            min={1}
            type="number"
            value={form.totalPages}
            onChange={(value) => onUpdate("totalPages", value)}
          />
          {form.shelf === "active" ? (
            <TextField
              label="Current page"
              min={0}
              type="number"
              value={form.currentPage}
              onChange={(value) => onUpdate("currentPage", value)}
            />
          ) : null}
        </div>

        {form.shelf === "active" ? (
          <>
            <div className="grid gap-2">
              <p className="text-sm text-faded">Target type</p>
              <div className="grid grid-cols-2 gap-2">
                {targetOptions.map((option) => (
                  <button
                    key={option.kind}
                    className={`rounded-md border px-3 py-3 text-left transition ${
                      form.targetKind === option.kind
                        ? "border-brass bg-brass/10 text-parchment"
                        : "border-white/10 bg-slate text-faded hover:border-brass hover:text-parchment"
                    }`}
                    onClick={() => onUpdate("targetKind", option.kind)}
                    type="button"
                  >
                    <span className="block text-sm font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs">{option.help}</span>
                  </button>
                ))}
              </div>
            </div>

            {form.targetKind === "deadline" ? (
              <TextField
                label="Finish by"
                type="date"
                value={form.finishBy}
                onChange={(value) => onUpdate("finishBy", value)}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Pages"
                  min={1}
                  type="number"
                  value={form.pages}
                  onChange={(value) => onUpdate("pages", value)}
                />
                {form.targetKind === "pagesEveryDays" ? (
                  <TextField
                    label="Every days"
                    min={1}
                    type="number"
                    value={form.days}
                    onChange={(value) => onUpdate("days", value)}
                  />
                ) : null}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-md border border-dashed border-white/15 bg-slate/50 p-3 text-sm leading-6 text-faded">
            Reading-list books stay out of goals until you open the book and press Start reading.
          </p>
        )}

        {formError ? <p className="text-sm text-brass">{formError}</p> : null}

        <button
          className="h-11 rounded-md bg-brass px-5 text-sm font-semibold text-charcoal transition hover:bg-[#d6b66d]"
          type="submit"
        >
          {editingBookId ? "Save book" : form.shelf === "readingList" ? "Add to reading list" : "Add book"}
        </button>
      </form>
    </section>
  );
}

function StartReadingForm({
  book,
  form,
  formError,
  onCancel,
  onSubmit,
  onUpdate,
}: {
  book: Book | undefined;
  form: StartReadingFormState;
  formError: string;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (field: keyof StartReadingFormState, value: string) => void;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-night p-5 shadow-2xl shadow-black/20">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-faded">Reading list</p>
          <h2 className="mt-1 font-display text-3xl text-parchment">Start reading</h2>
          {book ? <p className="mt-2 truncate text-sm text-faded">{book.title}</p> : null}
        </div>
        <button className="text-sm text-faded transition hover:text-parchment" onClick={onCancel} type="button">
          Cancel
        </button>
      </div>

      <form className="grid gap-4" onSubmit={onSubmit}>
        <TextField
          label="Current page"
          min={0}
          type="number"
          value={form.currentPage}
          onChange={(value) => onUpdate("currentPage", value)}
        />

        <div className="grid gap-2">
          <p className="text-sm text-faded">Target type</p>
          <div className="grid grid-cols-2 gap-2">
            {targetOptions.map((option) => (
              <button
                key={option.kind}
                className={`rounded-md border px-3 py-3 text-left transition ${
                  form.targetKind === option.kind
                    ? "border-brass bg-brass/10 text-parchment"
                    : "border-white/10 bg-slate text-faded hover:border-brass hover:text-parchment"
                }`}
                onClick={() => onUpdate("targetKind", option.kind)}
                type="button"
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs">{option.help}</span>
              </button>
            ))}
          </div>
        </div>

        {form.targetKind === "deadline" ? (
          <TextField
            label="Finish by"
            type="date"
            value={form.finishBy}
            onChange={(value) => onUpdate("finishBy", value)}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Pages"
              min={1}
              type="number"
              value={form.pages}
              onChange={(value) => onUpdate("pages", value)}
            />
            {form.targetKind === "pagesEveryDays" ? (
              <TextField
                label="Every days"
                min={1}
                type="number"
                value={form.days}
                onChange={(value) => onUpdate("days", value)}
              />
            ) : null}
          </div>
        )}

        {formError ? <p className="text-sm text-brass">{formError}</p> : null}

        <button
          className="h-11 rounded-md bg-brass px-5 text-sm font-semibold text-charcoal transition hover:bg-[#d6b66d]"
          type="submit"
        >
          Move to currently reading
        </button>
      </form>
    </section>
  );
}

function SquareBookCard({
  archived = false,
  readingList = false,
  book,
  sessions,
  onOpen,
}: {
  archived?: boolean;
  readingList?: boolean;
  book: Book;
  sessions: ReadingSession[];
  onOpen: (bookId: string) => void;
}) {
  const cover = resolveCoverSource(book.coverImage);
  const isQueued = readingList || isReadingListBook(book);
  const progress = isQueued ? 0 : bookProgress(book);
  const target = isQueued ? null : targetWindow(book, sessions);
  const isFinished = Boolean(book.finishedAt);

  const meta = archived
    ? `Added ${displayDate(book.addedAt)} · Finished ${displayDate(book.finishedAt)}`
    : isQueued
      ? "Waiting to start"
    : book.author;

  return (
    <article className="group relative aspect-square overflow-hidden rounded-md border border-white/10 bg-slate transition hover:border-brass">
      <button className="grid h-full w-full grid-rows-[minmax(0,1fr)_82px] text-left" onClick={() => onOpen(book.id)} type="button">
        <div className="min-h-0 overflow-hidden">
          {cover ? (
            <BookArtwork alt={`${book.title} cover`} cover={cover} />
          ) : (
            <div className="grid h-full place-items-center p-4 text-center">
              <div>
                <h3 className="fit-title font-display text-parchment">{book.title}</h3>
                <p className="fit-author mt-3 text-faded">{meta}</p>
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-white/10 bg-charcoal/85 p-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg leading-tight text-parchment">{book.title}</h3>
            <p className="mt-1 truncate text-xs text-faded">{meta}</p>
          </div>
          <div className="text-right">
            <p className="max-w-24 truncate text-[11px] uppercase text-brass">{book.category}</p>
            <p className="mt-1 text-xs text-parchment">{isQueued ? "queued" : `${Math.round(progress * 100)}%`}</p>
          </div>
        </div>
      </button>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-charcoal">
        <div className="h-full bg-brass" style={{ width: `${progress * 100}%` }} />
      </div>
      {!isQueued && (isFinished || (target && target.progress >= 1)) ? (
        <div className="absolute inset-0 ring-1 ring-inset ring-brass/70" />
      ) : null}
    </article>
  );
}

function BookArtwork({
  alt,
  cover,
  size = "shelf",
}: {
  alt: string;
  cover: string;
  size?: "shelf" | "large";
}) {
  const paddingClass = size === "large" ? "p-8" : "p-4";

  return (
    <div className={`relative h-full w-full overflow-hidden ${paddingClass}`}>
      <img
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-xl"
        src={cover}
        alt=""
      />
      <div className="absolute inset-0 bg-charcoal/45" />
      <img
        className="relative z-10 mx-auto h-full w-full object-contain drop-shadow-2xl"
        src={cover}
        alt={alt}
      />
    </div>
  );
}

function RecentBooks({ books, onOpenBook }: { books: Book[]; onOpenBook: (bookId: string) => void }) {
  if (!books.length) {
    return <p className="text-sm text-faded">No books yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {books.map((book) => (
        <button
          key={book.id}
          className="aspect-square rounded-md border border-white/10 bg-slate p-3 text-left transition hover:border-brass"
          onClick={() => onOpenBook(book.id)}
          type="button"
        >
          <span className="line-fit-small block font-display text-parchment">{book.title}</span>
          <span className="mt-2 block truncate text-xs text-faded">{book.author}</span>
          <ThinProgress value={bookProgress(book)} />
        </button>
      ))}
    </div>
  );
}

function PendingTasks({
  tasks,
  onLogBook,
}: {
  tasks: Array<{ book: Book; target: ReturnType<typeof targetWindow>; remaining: number }>;
  onLogBook: (bookId: string) => void;
}) {
  return (
    <section className="rounded-md border border-brass/30 bg-burgundy/10 p-4 shadow-[0_0_32px_rgba(197,160,89,0.06)]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase text-faded">Pending</p>
          <h2 className="mt-1 font-display text-3xl text-parchment">Today&apos;s tasks</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {tasks.length ? (
          tasks.map(({ book, target, remaining }) => {
            const ratio = quotaRatio(target);
            const tone = quotaTone(ratio);
            return (
              <button
                key={book.id}
                className={`grid min-h-24 rounded-md border bg-slate p-3 text-left transition hover:border-brass ${quotaBorderClass(tone)}`}
                onClick={() => onLogBook(book.id)}
                type="button"
              >
                <div className="flex h-full flex-col justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-fit-small font-display text-parchment">{book.title}</p>
                    <p className="mt-2 text-xs text-faded">
                      {remaining > 0 ? `${remaining} pages left` : "Target met"}
                    </p>
                  </div>
                  <div>
                    <span className={`text-sm ${quotaTextClass(tone)}`}>{Math.round(ratio * 100)}%</span>
                    <ThinProgress tone={tone} value={ratio} />
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <p className="col-span-2 text-sm text-faded">No active tasks.</p>
        )}
      </div>
    </section>
  );
}

function ReadingEvolutionChart({ sessions }: { sessions: ReadingSession[] }) {
  const [period, setPeriod] = useState<ChartPeriod>("daily");
  const points = useMemo(() => readingEvolutionPoints(sessions, period), [period, sessions]);
  const maxPages = Math.max(1, ...points.map((point) => point.pages));
  const chartWidth = 720;
  const chartHeight = 210;
  const padX = 22;
  const padY = 18;
  const usableWidth = chartWidth - padX * 2;
  const usableHeight = chartHeight - padY * 2;
  const coordinates = points.map((point, index) => {
    const x = padX + (points.length === 1 ? 0 : (index / (points.length - 1)) * usableWidth);
    const y = padY + usableHeight - (point.pages / maxPages) * usableHeight;
    return { ...point, x, y };
  });
  const path = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath =
    coordinates.length > 0
      ? `${coordinates[0].x},${chartHeight - padY} ${path} ${coordinates[coordinates.length - 1].x},${chartHeight - padY}`
      : "";
  const labelStride = period === "daily" ? 5 : period === "weekly" ? 2 : 2;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {(["daily", "weekly", "monthly"] as ChartPeriod[]).map((option) => (
          <button
            key={option}
            className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
              period === option
                ? "border-brass bg-brass text-charcoal"
                : "border-white/10 bg-slate text-faded hover:border-brass hover:text-parchment"
            }`}
            onClick={() => setPeriod(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-white/10 bg-slate p-4">
        <svg className="h-72 w-full" preserveAspectRatio="none" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <defs>
            <linearGradient id="reading-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#C5A059" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#C5A059" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((line) => {
            const y = padY + usableHeight - line * usableHeight;
            return <line key={line} stroke="rgba(232,227,215,0.08)" x1={padX} x2={chartWidth - padX} y1={y} y2={y} />;
          })}
          {areaPath ? <polygon fill="url(#reading-area)" points={areaPath} /> : null}
          {path ? <polyline fill="none" points={path} stroke="#C5A059" strokeLinecap="round" strokeWidth="3" /> : null}
          {coordinates.map((point) => (
            <circle key={point.key} cx={point.x} cy={point.y} fill="#121212" r="4" stroke="#C5A059" strokeWidth="2">
              <title>{`${point.label}: ${point.pages} pages`}</title>
            </circle>
          ))}
        </svg>

        <div
          className="mt-3 grid gap-1 text-[11px] text-faded"
          style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
        >
          {points.map((point, index) => (
            <span key={point.key} className="truncate text-center">
              {index % labelStride === 0 || index === points.length - 1 ? point.axisLabel : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PagesBarChart({ sessions }: { sessions: ReadingSession[] }) {
  const totals = pagesByDate(sessions);
  const days = lastDays(30);
  const maxPages = Math.max(1, ...days.map((day) => totals[day] ?? 0));

  return (
    <div className="flex h-48 items-end gap-1">
      {days.map((day) => {
        const pages = totals[day] ?? 0;
        const height = Math.max(4, (pages / maxPages) * 100);

        return (
          <div key={day} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-40 w-full items-end rounded bg-charcoal/80">
              <div
                className={`w-full rounded ${pages > 0 ? "bg-brass" : "bg-white/5"}`}
                style={{ height: `${height}%` }}
                title={`${day}: ${pages} pages`}
              />
            </div>
            <span className="hidden text-[10px] text-faded sm:block">{day.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Heatmap({
  compact = false,
  range,
  sessions,
  streak,
  onRangeChange,
}: {
  compact?: boolean;
  range: 30 | 90;
  sessions: ReadingSession[];
  streak: number;
  onRangeChange?: (range: 30 | 90) => void;
}) {
  const totals = useMemo(() => pagesByDate(sessions), [sessions]);
  const days = useMemo(() => lastDays(range), [range]);
  const maxPages = Math.max(1, ...days.map((day) => totals[day] ?? 0));

  return (
    <section className={compact ? "" : "rounded-md border border-white/10 bg-night p-5"}>
      {!compact ? (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase text-faded">Consistency</p>
            <h2 className="mt-1 font-display text-3xl text-parchment">Streak {streak}d</h2>
          </div>
          {onRangeChange ? (
            <div className="flex rounded-md border border-white/10 bg-slate p-1">
              {[30, 90].map((option) => (
                <button
                  key={option}
                  className={`rounded px-3 py-1 text-sm transition ${
                    range === option ? "bg-brass text-charcoal" : "text-faded hover:text-parchment"
                  }`}
                  onClick={() => onRangeChange(option as 30 | 90)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${range === 30 ? 15 : 18}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const pages = totals[day] ?? 0;
          const intensity = pages / maxPages;
          const className = heatClass(pages, intensity);

          return (
            <div
              key={day}
              className={`aspect-square rounded border border-white/5 ${className}`}
              title={`${day}: ${pages} pages`}
            />
          );
        })}
      </div>
    </section>
  );
}

function GoalGrid({ windows }: { windows: GoalWindow[] }) {
  return (
    <div className="grid grid-cols-[repeat(10,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(15,minmax(0,1fr))]">
      {windows.map((window) => (
        <div
          key={`${window.start}-${window.end}`}
          className={`aspect-square rounded border border-white/5 ${goalClass(window.progress, window.pagesRead)}`}
          title={`${window.label}: ${window.pagesRead}/${window.targetPages} pages`}
        />
      ))}
    </div>
  );
}

function CategoryChips({
  activeCategory,
  categories,
  onChange,
}: {
  activeCategory: string;
  categories: string[];
  onChange: (category: string) => void;
}) {
  const uniqueCategories = Array.from(new Set(categories));

  return (
    <div className="flex flex-wrap gap-2">
      {uniqueCategories.map((category) => (
        <button
          key={category}
          className={`rounded-md border px-3 py-2 text-sm transition ${
            activeCategory === category
              ? "border-brass bg-brass text-charcoal"
              : "border-white/10 bg-night text-faded hover:border-brass hover:text-parchment"
          }`}
          onClick={() => onChange(category)}
          type="button"
        >
          {category}
        </button>
      ))}
    </div>
  );
}

function NavButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded px-4 py-2 text-sm transition ${
        active ? "bg-brass text-charcoal" : "text-faded hover:text-parchment"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function TextField({ label, min, type = "text", value, onChange }: TextFieldProps) {
  return (
    <label className="grid gap-2 text-sm text-faded">
      {label}
      <input
        className="h-11 w-full rounded-md border border-white/10 bg-slate px-3 text-parchment outline-none transition placeholder:text-faded focus:border-brass"
        min={min}
        type={type}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

type TextFieldProps = {
  label: string;
  min?: number;
  type?: string;
  value: string;
  onChange: (value: string) => void;
};

function Stat({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: QuotaTone;
  value: number | string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-slate px-4 py-3">
      <p className="text-xs uppercase text-faded">{label}</p>
      <p className={`mt-2 font-display text-3xl ${tone ? quotaTextClass(tone) : "text-parchment"}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate/70 px-3 py-2">
      <dt className="text-faded">{label}</dt>
      <dd className="mt-1 text-parchment">{value}</dd>
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const clamped = Math.min(1, Math.max(0, progress));
  const degrees = Math.round(clamped * 360);
  const tone = quotaTone(progress);
  const color = quotaHex(tone);

  return (
    <div
      aria-label={`Target: ${Math.round(clamped * 100)}%`}
      className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${degrees}deg, #2b2b2b 0deg)`,
      }}
      title={`Target: ${Math.round(clamped * 100)}%`}
    >
      <div className={`grid h-10 w-10 place-items-center rounded-full bg-slate text-xs font-semibold ${quotaTextClass(tone)}`}>
        {Math.round(clamped * 100)}%
      </div>
    </div>
  );
}

function ThinProgress({ tone, value }: { tone?: QuotaTone; value: number }) {
  const width = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const progressTone = tone ?? "met";

  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded bg-charcoal">
      <div className={`h-full rounded ${quotaBgClass(progressTone)}`} style={{ width: `${width}%` }} />
    </div>
  );
}

function bookAnalytics(book: Book, sessions: ReadingSession[]) {
  const bookSessions = sessions.filter((session) => session.bookId === book.id);
  const pagesRecorded = bookSessions.reduce((sum, session) => sum + session.pagesRead, 0);
  const pagesToday = pagesForBookInRange(sessions, book.id, todayKey(), todayKey());
  const totals = pagesByDate(bookSessions);
  const readingDays = Object.values(totals).filter((pages) => pages > 0).length;
  const bestDayPages = Math.max(0, ...Object.values(totals));
  const sessionCount = bookSessions.length;
  const averageSessionPages = sessionCount ? Math.round(pagesRecorded / sessionCount) : 0;
  const currentBookStreak = currentStreak(bookSessions);
  const goalWindows = goalWindowsForBook(book, sessions);
  const windowsWithTarget = goalWindows.filter((window) => window.targetPages > 0);
  const metWindows = windowsWithTarget.filter((window) => window.pagesRead >= window.targetPages).length;
  const goalMeetRate = windowsWithTarget.length ? Math.round((metWindows / windowsWithTarget.length) * 100) : 0;
  const recentPace = recentAveragePages(bookSessions);
  const pagesRemaining = Math.max(0, book.totalPages - book.currentPage);
  const estimatedFinish =
    pagesRemaining === 0
      ? "Finished"
      : recentPace > 0
        ? addDays(todayKey(), Math.ceil(pagesRemaining / recentPace))
        : "No pace yet";

  return {
    averageSessionPages,
    bestDayPages,
    currentBookStreak,
    estimatedFinish,
    goalMeetRate,
    goalWindows,
    pagesRecorded,
    pagesToday,
    pagesRemaining,
    readingDays,
    sessionCount,
  };
}

function goalWindowsForBook(book: Book, sessions: ReadingSession[]): GoalWindow[] {
  const today = todayKey();
  const added = dateFromIso(book.addedAt);

  if (book.target.kind === "pagesPerWeek") {
    const currentStart = weekStart(today);
    const targetPages = book.target.pages;
    return Array.from({ length: 20 }, (_, index) => {
      const start = addDays(currentStart, (index - 19) * 7);
      const end = addDays(start, 6);
      const pagesRead = pagesForBookInRange(sessions, book.id, start, end);
      return makeGoalWindow(start, end, targetPages, pagesRead);
    });
  }

  if (book.target.kind === "pagesEveryDays") {
    const interval = Math.max(1, book.target.days);
    const targetPages = book.target.pages;
    const elapsed = Math.max(0, daysBetweenInclusive(added, today) - 1);
    const currentStart = addDays(added, Math.floor(elapsed / interval) * interval);
    return Array.from({ length: 30 }, (_, index) => {
      const start = addDays(currentStart, (index - 29) * interval);
      const end = addDays(start, interval - 1);
      const pagesRead = pagesForBookInRange(sessions, book.id, start, end);
      return makeGoalWindow(start, end, targetPages, pagesRead);
    });
  }

  const dailyTarget =
    book.target.kind === "deadline"
      ? Math.max(1, Math.ceil(book.totalPages / daysBetweenInclusive(added, book.target.finishBy)))
      : book.target.pages;

  return lastDays(60).map((day) => {
    const pagesRead = pagesForBookInRange(sessions, book.id, day, day);
    return makeGoalWindow(day, day, dailyTarget, pagesRead);
  });
}

function makeGoalWindow(start: string, end: string, targetPages: number, pagesRead: number): GoalWindow {
  return {
    label: start === end ? start : `${start} to ${end}`,
    start,
    end,
    targetPages,
    pagesRead,
    progress: pagesRead / Math.max(1, targetPages),
  };
}

function readingEvolutionPoints(sessions: ReadingSession[], period: ChartPeriod) {
  if (period === "daily") {
    return lastDays(30).map((day) => ({
      key: day,
      label: day,
      axisLabel: day.slice(5),
      pages: pagesForRange(sessions, day, day),
    }));
  }

  if (period === "weekly") {
    const currentStart = weekStart(todayKey());
    return Array.from({ length: 12 }, (_, index) => {
      const start = addDays(currentStart, (index - 11) * 7);
      const end = addDays(start, 6);
      return {
        key: start,
        label: `${start} to ${end}`,
        axisLabel: start.slice(5),
        pages: pagesForRange(sessions, start, end),
      };
    });
  }

  const currentMonth = monthStart(new Date());
  return Array.from({ length: 12 }, (_, index) => {
    const start = addMonths(currentMonth, index - 11);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const startKey = dateKeyFromDate(start);
    const endKey = dateKeyFromDate(end);

    return {
      key: startKey,
      label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      axisLabel: start.toLocaleDateString(undefined, { month: "short" }),
      pages: pagesForRange(sessions, startKey, endKey),
    };
  });
}

function pagesForRange(sessions: ReadingSession[], start: string, end: string): number {
  return sessions
    .filter((session) => session.date >= start && session.date <= end)
    .reduce((sum, session) => sum + session.pagesRead, 0);
}

function recentAveragePages(sessions: ReadingSession[]): number {
  const totals = pagesByDate(sessions);
  const activeDays = lastDays(14).map((day) => totals[day] ?? 0).filter((pages) => pages > 0);
  if (!activeDays.length) {
    return 0;
  }

  return Math.round(activeDays.reduce((sum, pages) => sum + pages, 0) / activeDays.length);
}

function createId(): string {
  return crypto.randomUUID();
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 0;
}

function targetFromForm(form: TargetFormState): ReadingTarget | null {
  const pages = positiveInteger(form.pages);

  if (form.targetKind === "deadline") {
    return form.finishBy ? { kind: "deadline", finishBy: form.finishBy } : null;
  }

  if (pages <= 0) {
    return null;
  }

  if (form.targetKind === "pagesEveryDays") {
    const days = positiveInteger(form.days);
    return days > 0 ? { kind: "pagesEveryDays", pages, days } : null;
  }

  if (form.targetKind === "pagesPerWeek") {
    return { kind: "pagesPerWeek", pages };
  }

  return { kind: "pagesPerDay", pages };
}

function defaultReadingTarget(): ReadingTarget {
  return { kind: "pagesPerDay", pages: 25 };
}

function startReadingFormFromBook(book: Book): StartReadingFormState {
  const base = defaultStartReadingForm();

  switch (book.target.kind) {
    case "pagesPerDay":
      base.pages = String(book.target.pages);
      break;
    case "pagesEveryDays":
      base.pages = String(book.target.pages);
      base.days = String(book.target.days);
      break;
    case "pagesPerWeek":
      base.pages = String(book.target.pages);
      break;
    case "deadline":
      base.finishBy = book.target.finishBy;
      break;
  }

  return {
    ...base,
    currentPage: String(book.currentPage),
    targetKind: book.target.kind,
  };
}

function formFromBook(book: Book): BookFormState {
  const base = defaultBookForm();

  switch (book.target.kind) {
    case "pagesPerDay":
      base.pages = String(book.target.pages);
      break;
    case "pagesEveryDays":
      base.pages = String(book.target.pages);
      base.days = String(book.target.days);
      break;
    case "pagesPerWeek":
      base.pages = String(book.target.pages);
      break;
    case "deadline":
      base.finishBy = book.target.finishBy;
      break;
  }

  return {
    ...base,
    title: book.title,
    author: book.author,
    category: book.category,
    shelf: book.shelf,
    coverImage: book.coverImage ?? "",
    pdfPath: book.pdfPath ?? "",
    totalPages: String(book.totalPages),
    currentPage: String(book.currentPage),
    targetKind: book.target.kind,
  };
}

function normalizeBook(book: Book): Book {
  const shelf = book.finishedAt ? "active" : normalizeShelf(book.shelf);

  return {
    ...book,
    category: normalizeCategory(book.category),
    shelf,
    pdfPath: book.pdfPath ?? null,
  };
}

function normalizeShelf(value: BookShelf | undefined): BookShelf {
  return value === "readingList" ? "readingList" : "active";
}

function isReadingListBook(book: Book): boolean {
  return !book.finishedAt && book.shelf === "readingList";
}

function isActiveBook(book: Book): boolean {
  return !book.finishedAt && book.shelf !== "readingList";
}

function normalizeCategory(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || unsortedCategory;
}

function categoriesFor(books: Book[]): string[] {
  return Array.from(new Set(books.map((book) => normalizeCategory(book.category)))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    if (a.finishedAt && !b.finishedAt) {
      return 1;
    }
    if (!a.finishedAt && b.finishedAt) {
      return -1;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function recalculateBookAfterLogDelete(
  book: Book,
  deletedSession: ReadingSession,
  remainingSessions: ReadingSession[],
  updatedAt: string,
): Book {
  const bookSessions = remainingSessions
    .filter((session) => session.bookId === book.id)
    .sort(compareSessionsAscending);
  const latestSession = bookSessions[bookSessions.length - 1];
  const nextPage = latestSession
    ? latestSession.toPage
    : Math.min(book.totalPages, deletedSession.fromPage);
  const completionSession = bookSessions.find((session) => session.toPage >= book.totalPages);

  return {
    ...book,
    currentPage: nextPage,
    updatedAt,
    finishedAt: nextPage >= book.totalPages ? completionSession?.createdAt ?? book.finishedAt : null,
  };
}

function compareSessionsAscending(a: ReadingSession, b: ReadingSession): number {
  const created = a.createdAt.localeCompare(b.createdAt);
  if (created !== 0) {
    return created;
  }

  return a.date.localeCompare(b.date);
}

function resolveCoverSource(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^(https?:|data:|asset:)/i.test(trimmed)) {
    return trimmed;
  }

  if (isTauri() && trimmed.startsWith("file://")) {
    return convertFileSrc(trimmed.replace("file://", ""));
  }

  if (isTauri() && trimmed.startsWith("/")) {
    return convertFileSrc(trimmed);
  }

  return trimmed;
}

function weekStart(day: string): string {
  const date = new Date(`${day}T00:00:00`);
  const dayIndex = date.getDay();
  const mondayOffset = dayIndex === 0 ? -6 : 1 - dayIndex;
  date.setDate(date.getDate() + mondayOffset);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const dateDay = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${dateDay}`;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function quotaRatio(target: ReturnType<typeof targetWindow>): number {
  return target.pagesRead / Math.max(1, target.targetPages);
}

function quotaTone(ratio: number): QuotaTone {
  if (ratio <= 0) {
    return "empty";
  }
  if (ratio < 1) {
    return "partial";
  }
  if (ratio <= 1.25) {
    return "met";
  }
  return "exceed";
}

function quotaTextClass(tone: QuotaTone): string {
  switch (tone) {
    case "empty":
      return "text-quota-red";
    case "partial":
      return "text-quota-yellow";
    case "met":
      return "text-quota-green";
    case "exceed":
      return "text-quota-blue";
  }
}

function quotaBgClass(tone: QuotaTone): string {
  switch (tone) {
    case "empty":
      return "bg-quota-red";
    case "partial":
      return "bg-quota-yellow";
    case "met":
      return "bg-quota-green";
    case "exceed":
      return "bg-quota-blue";
  }
}

function quotaBorderClass(tone: QuotaTone): string {
  switch (tone) {
    case "empty":
      return "border-quota-red/35";
    case "partial":
      return "border-quota-yellow/35";
    case "met":
      return "border-quota-green/40";
    case "exceed":
      return "border-quota-blue/45";
  }
}

function quotaHex(tone: QuotaTone): string {
  switch (tone) {
    case "empty":
      return "#B97878";
    case "partial":
      return "#D8BD73";
    case "met":
      return "#9FBD8F";
    case "exceed":
      return "#8EC7D2";
  }
}

function heatClass(pages: number, intensity: number): string {
  if (pages === 0) {
    return "bg-quota-red/45";
  }
  if (intensity < 0.34) {
    return "bg-quota-yellow/70";
  }
  if (intensity < 0.67) {
    return "bg-quota-green/75";
  }
  return "bg-quota-blue/80";
}

function goalClass(progress: number, pagesRead: number): string {
  return quotaBgClass(quotaTone(pagesRead === 0 ? 0 : progress));
}

export default App;
