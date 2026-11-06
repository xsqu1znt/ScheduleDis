// Starts a release: `pnpm release [--patch | --minor | --major]`. Defaults to a patch bump.
// Checks the repo, runs the tests and build, bumps the version, then pushes a commit and tag.
// The tag triggers .github/workflows/release.yml, which builds, signs and publishes both browsers' files on GitHub.
// The first release uses the current version as is, unless a flag asks for a bump.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const OPTIONS = {
  branch: "main",
  remote: "origin",
  versionFiles: ["package.json", "public/manifest.json"],
  builtManifests: ["dist/manifest.json", "dist-firefox/manifest.json"],
  bumps: ["patch", "minor", "major"],
};

const VERSION_FIELD = /"version":\s*"([^"]+)"/;

function fail(message) {
  console.error(`\nRelease stopped: ${message}`);
  process.exit(1);
}

/** Runs a command and returns its trimmed output. */
function capture(command, ...args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Runs a command with its output on screen. */
function run(command, ...args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function succeeds(command, ...args) {
  try {
    capture(command, ...args);
    return true;
  } catch {
    return false;
  }
}

/** @returns The requested bump, or null if no flag was given. */
function parseBump(args) {
  const unknown = args.filter(a => !OPTIONS.bumps.some(b => a === `--${b}`));
  if (unknown.length > 0) fail(`unknown option ${unknown.join(", ")}. Use --patch, --minor or --major.`);
  if (args.length > 1) fail("use only one of --patch, --minor or --major.");
  return args[0]?.slice(2) ?? null;
}

function readVersion(file) {
  const version = readFileSync(file, "utf8").match(VERSION_FIELD)?.[1];
  if (!version) fail(`couldn't find a version in ${file}.`);
  return version;
}

// Replaces only the version text, so the file's formatting stays as written.
function writeVersion(file, version) {
  writeFileSync(file, readFileSync(file, "utf8").replace(VERSION_FIELD, `"version": "${version}"`));
}

function nextVersion(version, bump) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(p => !Number.isInteger(p) || p < 0)) fail(`${version} isn't a version like 1.2.3.`);

  const [major, minor, patch] = parts;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function checkRepo() {
  const { branch, remote } = OPTIONS;
  const current = capture("git", "branch", "--show-current");
  if (current !== branch) fail(`you're on ${current || "a detached HEAD"}. Switch to ${branch} first.`);
  if (capture("git", "status", "--porcelain") !== "") fail("you have uncommitted changes. Commit or stash them first.");
  if (!succeeds("git", "remote", "get-url", remote)) fail(`this repo has no "${remote}" remote. Add your GitHub repo first.`);
  if (!succeeds("git", "fetch", remote, "--tags")) fail(`couldn't reach ${remote}.`);

  // A brand new GitHub repo has no branch yet, so there's nothing to be behind.
  const upstream = `${remote}/${branch}`;
  if (!succeeds("git", "rev-parse", "--verify", upstream)) return;
  if (capture("git", "rev-list", "--count", `HEAD..${upstream}`) !== "0") fail(`you're behind ${upstream}. Pull first.`);
}

function main() {
  // --- Check everything before changing anything ---
  const requested = parseBump(process.argv.slice(2));
  checkRepo();

  const [source, ...others] = OPTIONS.versionFiles;
  const current = readVersion(source);
  for (const file of others) {
    const other = readVersion(file);
    if (other !== current) fail(`${source} says ${current} but ${file} says ${other}. Make them match first.`);
  }

  const isFirstRelease = capture("git", "tag", "--list", "v*") === "";
  const bump = requested ?? (isFirstRelease ? null : "patch");
  const version = bump ? nextVersion(current, bump) : current;
  const tag = `v${version}`;
  if (succeeds("git", "rev-parse", "--verify", `refs/tags/${tag}`)) fail(`${tag} already exists.`);

  console.log(`Releasing ${tag}${bump ? ` (was ${current})` : ""}\n`);

  // --- Make sure this version works ---
  try {
    run("pnpm", "test");
    run("pnpm", "build");
    run("pnpm", "build:firefox");
  } catch {
    fail("the tests or build failed. Nothing was changed.");
  }

  // --- Bump, tag and push ---
  if (bump) {
    for (const file of OPTIONS.versionFiles) writeVersion(file, version);
    // The builds above wrote the old version, and they aren't committed, so they're updated separately.
    for (const file of OPTIONS.builtManifests) writeVersion(file, version);
    run("git", "add", ...OPTIONS.versionFiles);
    run("git", "commit", "--quiet", "-m", `chore(release): ${tag}`);
  }
  run("git", "tag", "-a", tag, "-m", tag);

  try {
    // Atomic, so GitHub never gets the tag without its commit.
    run("git", "push", "--atomic", OPTIONS.remote, OPTIONS.branch, tag);
  } catch {
    const undo = bump ? ` and undo the commit with: git reset --hard HEAD~1` : "";
    fail(`the push failed. To try again, delete the tag with: git tag -d ${tag}${undo}`);
  }

  console.log(`\nPushed ${tag}. GitHub is now building the release.`);
}

main();
