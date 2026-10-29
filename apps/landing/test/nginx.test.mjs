// The real nginx image serving dist/ with nginx.conf: Markdown negotiation, Vary and the 404s.
// Needs Docker and a build: NGINX_TEST=1 node --test test/nginx.test.mjs
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const run = process.env.NGINX_TEST === "1";
const root = fileURLToPath(new URL("../", import.meta.url));
const name = `rinde-landing-nginx-test-${process.pid}`;
const port = 18000 + (process.pid % 1000);
const base = `http://127.0.0.1:${port}`;

before(async () => {
  if (!run) return;
  const conf = join(mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "nginx-")), "default.conf");
  writeFileSync(conf, readFileSync(join(root, "nginx.conf"), "utf8").replaceAll("__APP_ORIGIN__", "https://app.example"));
  execFileSync("docker", ["run", "-d", "--rm", "--name", name, "-p", `127.0.0.1:${port}:80`,
    "-v", `${join(root, "dist")}:/usr/share/nginx/html:ro`, "-v", `${conf}:/etc/nginx/conf.d/default.conf:ro`, "nginx:stable-alpine-slim"]);
  for (let i = 0; i < 50; i++) {
    if (await fetch(base).then(() => true, () => false)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("nginx did not start");
});
after(() => { if (run) execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" }); });

const get = (path, accept) => fetch(`${base}${path}`, { headers: accept ? { accept } : {}, redirect: "follow" });

test("the homepage answers Markdown to Accept: text/markdown, HTML otherwise, with Vary: Accept", { skip: !run }, async () => {
  for (const path of ["/", "/en/", "/about/", "/about", "/en/privacy/"]) {
    const md = await get(path, "text/markdown");
    assert.equal(md.status, 200, path);
    assert.equal(md.headers.get("content-type"), "text/markdown; charset=utf-8", path);
    assert.match(md.headers.get("vary") ?? "", /\bAccept\b/, path);
    assert.match(await md.text(), /^# \S/, path);
  }
  for (const accept of ["text/html", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", undefined]) {
    const html = await get("/", accept);
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /^text\/html/);
    assert.match(html.headers.get("vary") ?? "", /\bAccept\b/);
    assert.match(await html.text(), /^<!doctype html>/i);
  }
});

test("a missing page is a 404, in Markdown when asked for", { skip: !run }, async () => {
  const md = await get("/__missing-page", "text/markdown");
  assert.equal(md.status, 404);
  assert.equal(md.headers.get("content-type"), "text/markdown; charset=utf-8");
  assert.match(await md.text(), /llms\.txt/);
  const html = await get("/__missing-page", "text/html");
  assert.equal(html.status, 404);
  assert.match(html.headers.get("content-type"), /^text\/html/);
  assert.match(await html.text(), /Esta página no existe/);
});

test("llms.txt, sitemap.xml and robots.txt are served with their types", { skip: !run }, async () => {
  for (const [path, type] of [["/llms.txt", /^text\/plain/], ["/sitemap.xml", /^(text|application)\/xml/], ["/robots.txt", /^text\/plain/]]) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.match(r.headers.get("content-type"), type, path);
  }
  // The static files keep their own types when Markdown is asked for.
  assert.match((await get("/llms.txt", "text/markdown")).headers.get("content-type"), /^text\/plain/);
});
