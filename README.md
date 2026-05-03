# Lore

A minimalist dark academia reading tracker for Fedora Linux, built with Tauri, React, Vite, Tailwind CSS, and local JSON storage.

## Fedora Setup

```bash
sudo dnf check-update
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install "c-development"
sudo dnf install nodejs npm
```

Use rustup for Rust. Current Tauri dependencies require a newer Rust than the older `rustc 1.85` toolchain.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable
```

## Development

```bash
npm install
npm run tauri dev
```

## Project Shape

- `src/`: React frontend.
- `src-tauri/`: Rust/Tauri desktop shell.
- Local data is stored as `library.json` in Tauri's app data directory.
- Pages: Home dashboard, Library shelves, and per-book analytics.
