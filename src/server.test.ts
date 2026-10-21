import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addJobs } from "./jobsCsv.js";
import { createServer } from "./server.js";
import { createWorkspace, jobsCsvPath } from "./workspace.js";

let workspace: string;
let server: http.Server;
let port: number;

beforeAll(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), "cvhelper-server-"));
  await createWorkspace(workspace);
  await addJobs(jobsCsvPath(workspace), [
    { id: "lever-1", title: "QA", job_link: "https://jobs.lever.co/acme/abc-123", cv_choice: "predefined: qa.pdf" },
    { id: "hireme-2", title: "Dev", agency_link: "https://hiremetech.com/job/2", cv_status: "built" },
    { id: "done-3", title: "Old", submitted: "YES" },
  ]);
  server = createServer(workspace).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.close();
  await rm(workspace, { recursive: true, force: true });
});

// A raw request, so the Host and Origin headers can be anything.
function request(method: string, urlPath: string, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: urlPath, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null }));
    });
    req.on("error", reject);
    req.end(method === "GET" ? undefined : "{}");
  });
}

describe("only this computer may use the server", () => {
  it("answers its own pages, the extension and the command line", async () => {
    expect((await request("GET", "/api/jobs")).status).toBe(200);
    const json = { "content-type": "application/json" };
    expect((await request("POST", "/api/extension/current", { ...json, origin: `http://127.0.0.1:${port}` })).status).toBe(200);
    expect((await request("POST", "/api/extension/current", { ...json, origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" })).status).toBe(200);
    expect((await request("POST", "/api/extension/current", json)).status).toBe(200);
  });

  it("refuses changes sent by other websites and other host names", async () => {
    expect((await request("POST", "/api/cvs?name=x.pdf", { origin: "https://evil.example" })).status).toBe(403);
    expect((await request("GET", "/api/jobs", { host: "evil.example" })).status).toBe(403);
  });
});

describe("extension state", () => {
  it("lists open jobs and matches the page to a job", async () => {
    const state = (await request("GET", `/api/extension/state?url=${encodeURIComponent("https://jobs.lever.co/acme/abc-123/apply")}`)).body;
    expect(state.match).toBe("lever-1");
    expect(state.jobs.map((j: any) => [j.id, j.cv_ready])).toEqual([["lever-1", true], ["hireme-2", true]]);
    const byAgency = (await request("GET", `/api/extension/state?url=${encodeURIComponent("https://juniors.hiremetech.com/job/2?utm_source=x")}`)).body;
    expect(byAgency.match).toBe("hireme-2");
  });
});
