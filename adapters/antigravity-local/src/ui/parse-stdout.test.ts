import { describe, expect, it } from "vitest";
import { parseAntigravityStdoutLine } from "./parse-stdout.js";

describe("parseAntigravityStdoutLine", () => {
  const ts = "2026-09-25T16:00:00.000Z";

  it("parses init event", () => {
    const line = JSON.stringify({
      event: "init",
      conversation_id: "conv-12345",
    });

    const entries = parseAntigravityStdoutLine(line, ts);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("init");
    expect((entries[0] as any).sessionId).toBe("conv-12345");
  });

  it("parses thinking event", () => {
    const line = JSON.stringify({
      thinking: "Analyzing the architecture...",
    });

    const entries = parseAntigravityStdoutLine(line, ts);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("thinking");
    expect((entries[0] as any).text).toBe("Analyzing the architecture...");
  });

  it("parses tool calls array", () => {
    const line = JSON.stringify({
      tool_calls: [
        { name: "read_file", args: { path: "src/index.ts" }, id: "call-1" },
      ],
    });

    const entries = parseAntigravityStdoutLine(line, ts);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("tool_call");
    expect((entries[0] as any).name).toBe("read_file");
  });

  it("parses tool result", () => {
    const line = JSON.stringify({
      event: "tool_result",
      tool_use_id: "call-1",
      content: "file content here",
      is_error: false,
    });

    const entries = parseAntigravityStdoutLine(line, ts);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("tool_result");
    expect((entries[0] as any).content).toBe("file content here");
    expect((entries[0] as any).isError).toBe(false);
  });

  it("falls back to stdout on non-json line", () => {
    const entries = parseAntigravityStdoutLine("Some random log", ts);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("stdout");
  });
});
