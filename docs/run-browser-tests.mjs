#!/usr/bin/env node
// Runs the tests of a shadow-cljs :browser-test build in a headless browser.
// Prints the results and exits with 0 if all tests passed, 1 if any failed, 2 if the tests could not run.
//
// Requires playwright: npm install --save-dev playwright && npx playwright install chromium
//
// Usage:
//   node run-browser-tests.mjs <test-dir-or-url> [options]
//
//   <test-dir-or-url>  the :test-dir of a compiled or released build, served by this script,
//                      or the URL of an already served test page, eg. http://localhost:8021
//
// Options:
//   --test=a.ns,a.ns/some-test  only run these namespaces and tests
//   --filter=text               only run tests whose ns/name contains text, comma separated alternatives
//   --json                      print the JSON report instead of the text report
//   --console                   also print the console output of the page
//   --browser=chromium          chromium, firefox or webkit
//   --timeout=120000            give up after this many ms

import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const USAGE = "Usage: node run-browser-tests.mjs <test-dir-or-url> [--test=...] [--filter=...] [--json] [--console] [--browser=chromium] [--timeout=ms]";

function parseArgs(argv) {
  const opts = { target: null, test: null, filter: null, json: false, console: false, browser: "chromium", timeout: 120000 };
  for (const arg of argv) {
    if (arg === "--json") opts.json = true;
    else if (arg === "--console") opts.console = true;
    else if (arg.startsWith("--test=")) opts.test = arg.slice(7);
    else if (arg.startsWith("--filter=")) opts.filter = arg.slice(9);
    else if (arg.startsWith("--browser=")) opts.browser = arg.slice(10);
    else if (arg.startsWith("--timeout=")) opts.timeout = parseInt(arg.slice(10), 10);
    else if (arg.startsWith("--")) fail(`Unknown option: ${arg}\n${USAGE}`);
    else opts.target = arg;
  }
  if (!opts.target) fail(USAGE);
  return opts;
}

// problems running the tests, as opposed to failing tests
class RunnerError extends Error {}

function fail(msg) {
  throw new RunnerError(msg);
}

async function loadPlaywright() {
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return await import(name);
    } catch (e) {
      // try the next one
    }
  }
  fail("playwright not found. Install it via: npm install --save-dev playwright && npx playwright install chromium");
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

// minimal static file server for the generated index.html and its JS modules
function serveDir(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, "index.html"))) {
    fail(`${root}/index.html not found. Compile the :browser-test build first, eg. npx shadow-cljs compile test`);
  }

  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.join(root, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end();
      } else {
        res.writeHead(200, { "content-type": MIME_TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const pw = await loadPlaywright();
  const browserType = pw[opts.browser];
  if (!browserType) fail(`Unknown browser: ${opts.browser}`);

  let server = null;
  let url = opts.target;
  if (!/^https?:\/\//.test(url)) {
    ({ server, url } = await serveDir(url));
  }

  const pageUrl = new URL(url);
  if (opts.test) pageUrl.searchParams.set("test", opts.test);
  if (opts.filter) pageUrl.searchParams.set("filter", opts.filter);

  const browser = await browserType.launch();
  const pageErrors = [];
  let exitCode = 2;

  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) => {
      pageErrors.push(err);
      if (opts.console) console.error(`[pageerror] ${err.stack || err.message}`);
    });
    if (opts.console) {
      page.on("console", (msg) => console.error(`[console.${msg.type()}] ${msg.text()}`));
    }

    const deadline = Date.now() + opts.timeout;
    const remaining = () => Math.max(1, deadline - Date.now());

    await page.goto(pageUrl.toString(), { timeout: remaining() });

    try {
      await page.waitForFunction(() => window.shadowTest, null, { timeout: Math.min(remaining(), 30000) });
    } catch (e) {
      const errors = pageErrors.map((err) => `  ${err.message}`).join("\n");
      fail(`The page at ${pageUrl} did not load the shadow-cljs test runner (window.shadowTest).` +
           (errors ? `\nPage errors:\n${errors}` : ""));
    }

    const done = page.evaluate(() => shadowTest.done());
    // rejects when the browser is closed after a timeout, nothing left to do then
    done.catch(() => {});

    const report = await Promise.race([
      done,
      new Promise((resolve) => setTimeout(() => resolve(null), remaining())),
    ]);

    if (!report) {
      fail(`Tests did not complete within ${opts.timeout}ms.`);
    }

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(await page.evaluate(() => shadowTest.text()));
    }

    if (report.status === "passed") {
      exitCode = 0;
    } else if (report.status === "failed") {
      exitCode = 1;
    } else {
      // "idle", nothing ran. eg. --test or --filter didn't match anything
      if (!opts.json) console.error("No tests ran.");
      exitCode = 2;
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e instanceof RunnerError ? e.message : (e.stack || String(e)));
  process.exit(2);
});
