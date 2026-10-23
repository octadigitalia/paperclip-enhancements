function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function asRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return null;
    return value;
}
function asString(value, fallback = "") {
    return typeof value === "string" ? value : fallback;
}
function stringifyUnknown(value) {
    if (typeof value === "string")
        return value;
    if (value === null || value === undefined)
        return "";
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
let toolCallCounter = 0;
export function parseAntigravityStdoutLine(line, ts) {
    const trimmed = line.trim();
    if (!trimmed)
        return [];
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
        return [{ kind: "stdout", ts, text: line }];
    }
    const parsed = asRecord(safeJsonParse(trimmed));
    if (!parsed) {
        return [{ kind: "stdout", ts, text: line }];
    }
    const entries = [];
    // 1. Init event
    if (parsed.event === "init" || parsed.type === "init") {
        const convId = asString(parsed.conversation_id, asString(parsed.conversationId));
        const initData = asRecord(parsed.init);
        return [{
                kind: "init",
                ts,
                sessionId: convId || undefined,
                text: convId ? `Antigravity conversation started: ${convId}` : "Antigravity initialized",
            }];
    }
    // 1b. Antigravity step_update event
    if (parsed.event === "step_update" && parsed.step_update) {
        const su = asRecord(parsed.step_update);
        if (su) {
            const stepIdx = su.step_index !== undefined ? su.step_index : ++toolCallCounter;
            const toolId = `step_${stepIdx}`;
            if (su.step_type === "tool") {
                const toolInfo = asRecord(su.tool_info);
                if (su.state === "ACTIVE") {
                    const name = asString(su.tool_name, asString(toolInfo?.name, "tool"));
                    const input = toolInfo?.parameters ?? toolInfo?.args ?? {};
                    return [{
                            kind: "tool_call",
                            ts,
                            name,
                            input: typeof input === "object" && input !== null ? input : { value: input },
                            toolUseId: toolId,
                        }];
                }
                if (su.state === "DONE") {
                    const rawOut = toolInfo?.output ?? toolInfo?.result ?? "";
                    const content = typeof rawOut === "string" ? rawOut : JSON.stringify(rawOut, null, 2);
                    const isError = typeof toolInfo?.exitCode === "number" && toolInfo.exitCode !== 0;
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
                const stepEntries = [];
                const thinking = asString(su.thinking_delta, asString(su.thinking));
                if (thinking.trim()) {
                    stepEntries.push({ kind: "thinking", ts, text: thinking.trim() });
                }
                const text = asString(su.text_delta, asString(su.content));
                if (text.trim()) {
                    stepEntries.push({ kind: "assistant", ts, text: text.trim() });
                }
                if (su.state === "DONE" && su.usage) {
                    const usage = asRecord(su.usage);
                    stepEntries.push({
                        kind: "result",
                        ts,
                        text: "Model response completed",
                        inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : undefined,
                        outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined,
                    });
                }
                if (stepEntries.length > 0)
                    return stepEntries;
                return [];
            }
            if (su.step_type === "user_input") {
                const content = asString(su.content);
                if (content) {
                    return [{ kind: "user", ts, text: content }];
                }
                return [];
            }
        }
    }
    // 2. Thinking
    if (parsed.thinking || parsed.event === "thinking" || parsed.type === "thinking") {
        const thinkText = asString(parsed.thinking, asString(parsed.content, asString(parsed.text)));
        if (thinkText.trim()) {
            return [{ kind: "thinking", ts, text: thinkText.trim() }];
        }
    }
    // 3. Tool Calls
    if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        for (const tcRaw of parsed.tool_calls) {
            const tc = asRecord(tcRaw);
            if (!tc)
                continue;
            const name = asString(tc.name, "tool");
            const toolUseId = asString(tc.id, `agy-tool-${++toolCallCounter}`);
            entries.push({
                kind: "tool_call",
                ts,
                name,
                input: tc.args ?? tc.input ?? {},
                toolUseId,
            });
        }
        if (entries.length > 0)
            return entries;
    }
    if (parsed.event === "tool_call" || parsed.type === "tool_call") {
        const name = asString(parsed.name, asString(parsed.tool, "tool"));
        const toolUseId = asString(parsed.id, asString(parsed.tool_use_id, `agy-tool-${++toolCallCounter}`));
        return [{
                kind: "tool_call",
                ts,
                name,
                input: parsed.input ?? parsed.args ?? {},
                toolUseId,
            }];
    }
    // 4. Tool Results
    if (parsed.event === "tool_result" || parsed.type === "tool_result" || parsed.type === "tool_response") {
        const toolUseId = asString(parsed.tool_use_id, asString(parsed.toolUseId, asString(parsed.id, `agy-tool-${toolCallCounter}`)));
        const content = asString(parsed.content, asString(parsed.output, asString(parsed.result, stringifyUnknown(parsed.data))));
        const isError = parsed.is_error === true || asString(parsed.status).toLowerCase() === "error";
        return [{
                kind: "tool_result",
                ts,
                toolUseId,
                content,
                isError,
            }];
    }
    // 5. Assistant Message / Planner Response
    if (parsed.type === "PLANNER_RESPONSE" || parsed.role === "assistant" || parsed.type === "assistant" || parsed.event === "message") {
        const content = asString(parsed.content, asString(parsed.text, ""));
        if (content.trim()) {
            return [{ kind: "assistant", ts, text: content.trim() }];
        }
    }
    // 6. Final Result / Done
    if (parsed.event === "result" || parsed.status === "DONE") {
        const summary = asString(parsed.summary, asString(parsed.content, ""));
        const usage = asRecord(parsed.usage) ?? asRecord(parsed.usageMetadata);
        return [{
                kind: "result",
                ts,
                text: summary || "Execution completed",
                inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : undefined,
                outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : undefined,
            }];
    }
    // Fallback to assistant or stdout
    if (parsed.content && typeof parsed.content === "string") {
        return [{ kind: "assistant", ts, text: parsed.content }];
    }
    return [{ kind: "stdout", ts, text: line }];
}
//# sourceMappingURL=parse-stdout.js.map