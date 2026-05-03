import { invoke, isTauri } from "@tauri-apps/api/core";
import { emptyLibrary, type LibraryData } from "../types";

const browserStorageKey = "lore.library.v1";

export async function loadLibrary(): Promise<LibraryData> {
  if (isTauri()) {
    return invoke<LibraryData>("load_library");
  }

  const raw = window.localStorage.getItem(browserStorageKey);
  if (!raw) {
    return emptyLibrary;
  }

  return JSON.parse(raw) as LibraryData;
}

export async function saveLibrary(data: LibraryData): Promise<void> {
  if (isTauri()) {
    await invoke("save_library", { data });
    return;
  }

  window.localStorage.setItem(browserStorageKey, JSON.stringify(data, null, 2));
}
