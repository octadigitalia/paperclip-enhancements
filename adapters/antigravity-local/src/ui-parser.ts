// Self-contained browser-safe transcript parser for Paperclip dynamic UI loader
// Complies with paperclip.adapterUiParser: "1.0.0" contract (zero runtime imports)

let toolCounter = 0;

export function parseStdoutLine(line: string, ts: string) {
  const trimmed = line.trim();
  if (!trimmed) return [];

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    if (trimmed.startsWith("[paperclip]") || trimmed.startsWith("[system]")) {
      return [{ kind: "system", ts, text: trimmed }];
    }
    return [{ kind: "stdout", ts, text: line }];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return [{ kind: "stdout", ts, text: line }];
    }

    // 1. Google Antigravity stream-json step_update events
    if (parsed.event === "step_update" && parsed.step_update) {
      const su = parsed.step_update;
      const stepIdx = su.step_index !== undefined ? su.step_index : ++toolCounter;
      const toolId = `step_${stepIdx}`;

      if (su.step_type === "tool") {
        if (su.state === "ACTIVE") {
          const name = String(su.tool_name || su.tool_info?.name || "tool");
          const input = su.tool_info?.parameters || su.tool_info?.args || {};
          return [{
            kind: "tool_call",
            ts,
            name,
            input,
            toolUseId: toolId,
          }];
        }
        if (su.state === "DONE") {
          const rawOut = su.tool_info?.output ?? su.tool_info?.result ?? "";
          const content = typeof rawOut === "string" ? rawOut : JSON.stringify(rawOut, null, 2);
          const isError = su.tool_info?.exitCode !== undefined && su.tool_info.exitCode !== 0;
          return [{
            kind: "tool_result",
            ts,
            toolUseId: toolId,
            content,
            isError,
          }];
        }
      }

      if (su.step_type === "agent_response") {
        const entries = [];
        if (typeof su.thinking === "string" && su.thinking.trim()) {
          entries.push({ kind: "thinking", ts, text: su.thinking.trim() });
        }
        if (typeof su.content === "string" && su.content.trim()) {
          entries.push({ kind: "assistant", ts, text: su.content.trim() });
        }
        if (su.state === "DONE" && su.usage) {
          entries.push({
            kind: "result",
            ts,
            text: "Model response completed",
            inputTokens: typeof su.usage.input_tokens === "number" ? su.usage.input_tokens : undefined,
            outputTokens: typeof su.usage.output_tokens === "number" ? su.usage.output_tokens : undefined,
          });
        }
        if (entries.length > 0) return entries;
        return [];
      }

      if (su.step_type === "user_input") {
        if (su.content) {
          return [{ kind: "user", ts, text: String(su.content) }];
        }
        return [];
      }
    }

    // 2. Init event
    if (parsed.event === "init" || parsed.type === "init") {
      const convId = parsed.conversation_id || parsed.conversationId;
      return [{
        kind: "init",
        ts,
        sessionId: convId ? String(convId) : undefined,
        text: convId ? `Antigravity conversation started: ${convId}` : "Antigravity initialized",
      }];
    }

    // 3. Thinking (direct event or field)
    const thinkingText = parsed.thinking || (parsed.event === "thinking" ? (parsed.content || parsed.text) : null);
    if (typeof thinkingText === "string" && thinkingText.trim()) {
      return [{ kind: "thinking", ts, text: thinkingText.trim() }];
    }

    // 4. Tool Calls (direct / standard)
    if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      return parsed.tool_calls.map((tc: any) => ({
        kind: "tool_call",
        ts,
        name: String(tc.name || "tool"),
        input: tc.args || tc.input || {},
        toolUseId: String(tc.id || `agy-tool-${++toolCounter}`),
      }));
    }

    if (parsed.event === "tool_call" || parsed.type === "tool_call") {
      return [{
        kind: "tool_call",
        ts,
        name: String(parsed.name || parsed.tool || "tool"),
        input: parsed.input || parsed.args || {},
        toolUseId: String(parsed.id || parsed.tool_use_id || `agy-tool-${++toolCounter}`),
      }];
    }

    // 5. Tool Results (direct / standard)
    if (parsed.event === "tool_result" || parsed.type === "tool_result" || parsed.type === "tool_response") {
      const toolUseId = String(parsed.tool_use_id || parsed.toolUseId || parsed.id || `agy-tool-${toolCounter}`);
      const rawContent = parsed.content ?? parsed.output ?? parsed.result ?? parsed.data ?? "";
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent, null, 2);
      const isError = parsed.is_error === true || String(parsed.status).toLowerCase() === "error";
      return [{
        kind: "tool_result",
        ts,
        toolUseId,
        content,
        isError,
      }];
    }

    // 6. Assistant / Planner response
    if (parsed.type === "PLANNER_RESPONSE" || parsed.role === "assistant" || parsed.type === "assistant") {
      const content = parsed.content || parsed.text || parsed.response || "";
      if (typeof content === "string" && content.trim()) {
        return [{ kind: "assistant", ts, text: content.trim() }];
      }
    }

    // 7. Result / Done
    if (parsed.event === "result" || parsed.status === "DONE" || parsed.status === "SUCCESS") {
      const summary = parsed.summary || parsed.content || parsed.result?.response || "Execution completed";
      const usage = parsed.usage || parsed.usageMetadata;
      return [{
        kind: "result",
        ts,
        text: String(summary),
        inputTokens: usage && typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
        outputTokens: usage && typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
      }];
    }

    if (typeof parsed.content === "string" && parsed.content.trim()) {
      return [{ kind: "assistant", ts, text: parsed.content.trim() }];
    }

    return [{ kind: "stdout", ts, text: line }];
  } catch {
    return [{ kind: "stdout", ts, text: line }];
  }
}
