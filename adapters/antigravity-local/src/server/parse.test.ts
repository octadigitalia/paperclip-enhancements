import { describe, expect, it } from "vitest";
import {
  parseAntigravityJsonl,
  isAntigravityUnknownSessionError,
  detectAntigravityAuthRequired,
} from "./parse.js";

describe("parseAntigravityJsonl", () => {
  it("extracts conversationId from init event", () => {
    const stdout = JSON.stringify({
      event: "init",
      conversation_id: "test-conv-1234",
      init: { cwd: "/workspace", tools: ["run_command"] },
    });

    const parsed = parseAntigravityJsonl(stdout);
    expect(parsed.conversationId).toBe("test-conv-1234");
  });

  it("extracts assistant messages and tokens from stream", () => {
    const stdout = [
      JSON.stringify({ event: "init", conversation_id: "conv-abc" }),
      JSON.stringify({ type: "PLANNER_RESPONSE", content: "Working on task..." }),
      JSON.stringify({
        event: "result",
        summary: "Task finished successfully.",
        usage: { input_tokens: 150, output_tokens: 45 },
      }),
    ].join("\n");

    const parsed = parseAntigravityJsonl(stdout);
    expect(parsed.conversationId).toBe("conv-abc");
    expect(parsed.summary).toBe("Task finished successfully.");
    expect(parsed.usage.inputTokens).toBe(150);
    expect(parsed.usage.outputTokens).toBe(45);
  });

  it("detects unknown conversation errors", () => {
    expect(
      isAntigravityUnknownSessionError("", "Error: conversation not found"),
    ).toBe(true);
    expect(
      isAntigravityUnknownSessionError("cannot resume conversation: 1234", ""),
    ).toBe(true);
    expect(
      isAntigravityUnknownSessionError("ok", "everything fine"),
    ).toBe(false);
  });

  it("detects authentication requirements", () => {
    expect(
      detectAntigravityAuthRequired("", "Authentication required: please run agy login"),
    ).toBe(true);
    expect(
      detectAntigravityAuthRequired("all good", ""),
    ).toBe(false);
  });
});
