import { afterEach, describe, expect, it, vi } from "vitest";
import { geminiApi } from "./geminiApi.js";
import { openaiApi } from "./openaiApi.js";
import { jsonFromAnswer } from "./otherClis.js";

const request = { system: "Be brief.", prompt: "Count to one.", schema: { type: "object" } };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("openaiApi", () => {
  it("sends a strict JSON schema and reads the output text", async () => {
    const fetchMock = stubFetch({ output: [{ content: [{ type: "output_text", text: '{"n":1}' }] }] });
    expect(await openaiApi({ apiKey: "k", model: "m" }).generateJson(request)).toEqual({ n: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "m", instructions: "Be brief.", input: "Count to one." });
    expect(body.text.format).toMatchObject({ type: "json_schema", strict: true, schema: { type: "object" } });
  });

  it("explains a missing key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(openaiApi().generateJson(request)).rejects.toThrow("No OpenAI API key");
    vi.unstubAllEnvs();
  });
});

describe("geminiApi", () => {
  it("sends the schema as responseJsonSchema and reads the candidate text", async () => {
    const fetchMock = stubFetch({ candidates: [{ content: { parts: [{ text: '{"n":1}' }] } }] });
    expect(await geminiApi({ apiKey: "k", model: "g" }).generateJson(request)).toEqual({ n: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/g:generateContent");
    expect(JSON.parse(String(init.body)).generationConfig.responseJsonSchema).toEqual({ type: "object" });
  });
});

describe("jsonFromAnswer", () => {
  it("finds the JSON inside a chatty or fenced answer", () => {
    expect(jsonFromAnswer('Sure!\n```json\n{"a": [1, 2]}\n```')).toEqual({ a: [1, 2] });
    expect(() => jsonFromAnswer("no json here")).toThrow("No JSON");
  });
});
