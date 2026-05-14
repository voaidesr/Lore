# Lore

Lore is a minimalist dark academia desktop app for tracking reading progress, goals, consistency, and finished books. It is built with Tauri, React, Vite, Tailwind CSS, and local JSON storage.

## Features

- Library shelf with square book cards, cover support, categories, filters, and archive view.
- Per-book targets: pages per day, pages every N days, pages per week, or finish-by date.
- Fast progress logging that records sessions and recalculates the current page.
- Dashboard for pages read, streaks, pending tasks, recent books, and reading evolution.
- GitHub-style heatmaps and target grids for consistency and goal completion.
- Per-book analytics: pages today, pages left, goal meet rate, best day, activity chart, and forecast.
- Discreet reading log history with deletion for mistaken entries.
- Optional PDF path per book with a subtle `open in Okular` action from the book detail view.
- Strict dark mode with a minimalist glassy dark academia aesthetic.

Lore stores data locally in the Tauri app data directory. No account or network service is required.

## Install From A Release

Download the latest RPM from the GitHub Releases page, then install it on Fedora:

```bash
sudo dnf install ./Lore-0.1.0-1.x86_64.rpm
```

Install Okular if you want to open attached PDFs from Lore:

```bash
sudo dnf install okular
```

## Fedora Development Setup

```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel okular
sudo dnf group install "c-development"
sudo dnf install nodejs npm
```

Use rustup for Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
```

Run the app locally:

```bash
npm ci
npm run tauri dev
```

## Build

Build a local installable release:

```bash
npm run release:build
```

The script builds the Tauri package, copies installable artifacts into `release/`, and writes `release/SHA256SUMS`.

## Versioning And Releases

Lore uses semantic versions: `major.minor.patch`.

Bump all version files together:

```bash
npm run version:bump -- patch
npm run version:bump -- minor
npm run version:bump -- 0.2.0
```

Then commit and tag:

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "chore: release v0.2.0"
git tag -a v0.2.0 -m "Lore v0.2.0"
git push origin main --follow-tags
```

Replace `origin` with `upstream` if that is the remote you use for GitHub.

Pushing a `v*.*.*` tag triggers the GitHub Release workflow. It builds the Fedora RPM, uploads the artifact, adds checksums, and publishes a GitHub Release.

## Project Shape

- `src/`: React frontend.
- `src/lib/`: reading calculations and local persistence helpers.
- `src-tauri/`: Rust/Tauri desktop shell and native commands.
- `.github/workflows/`: CI and tagged release automation.
- `scripts/`: local release and versioning scripts.

## License

MIT. See [LICENSE](LICENSE).
