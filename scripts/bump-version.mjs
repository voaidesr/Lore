#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const packageLockPath = path.join(root, "package-lock.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");

const packageJson = readJson(packagePath);
const currentVersion = packageJson.version;
const requestedVersion = process.argv[2];

if (!requestedVersion) {
  fail(`Usage: npm run version:bump -- <major|minor|patch|x.y.z>\nCurrent version: ${currentVersion}`);
}

const nextVersion = resolveVersion(currentVersion, requestedVersion);

packageJson.version = nextVersion;
writeJson(packagePath, packageJson);

const packageLock = readJson(packageLockPath);
packageLock.version = nextVersion;
if (packageLock.packages?.[""]) {
  packageLock.packages[""].version = nextVersion;
}
writeJson(packageLockPath, packageLock);

const tauriConfig = readJson(tauriConfigPath);
tauriConfig.version = nextVersion;
writeJson(tauriConfigPath, tauriConfig);

replaceInFile(cargoTomlPath, /(^version = ")[^"]+(")$/m, `$1${nextVersion}$2`);
replaceInFile(
  cargoLockPath,
  /(\[\[package\]\]\nname = "lore"\nversion = ")[^"]+(")/,
  `$1${nextVersion}$2`,
);

console.log(`Updated Lore to v${nextVersion}.`);
console.log("");
console.log("Recommended release flow:");
console.log("  npm run build");
console.log("  git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json");
console.log(`  git commit -m "chore: release v${nextVersion}"`);
console.log(`  git tag -a v${nextVersion} -m "Lore v${nextVersion}"`);
console.log("  git push origin main --follow-tags");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function replaceInFile(filePath, pattern, replacement) {
  const current = fs.readFileSync(filePath, "utf8");
  const next = current.replace(pattern, replacement);

  if (next === current) {
    fail(`Could not update ${path.relative(root, filePath)}.`);
  }

  fs.writeFileSync(filePath, next);
}

function resolveVersion(current, requested) {
  if (isSemver(requested)) {
    return requested;
  }

  const match = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    fail(`Current version is not a simple semantic version: ${current}`);
  }

  const [, major, minor, patch] = match.map(Number);

  switch (requested) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      fail("Version must be major, minor, patch, or an explicit x.y.z value.");
  }
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+$/.test(value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
