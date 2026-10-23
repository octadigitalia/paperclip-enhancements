import pc from "picocolors";
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
export function printAntigravityStreamEvent(raw, debug) {
    const line = raw.trim();
    if (!line)
        return;
    if (!line.startsWith("{") || !line.endsWith("}")) {
        if (debug)
            console.log(pc.gray(line));
        return;
    }
    let parsed = null;
    try {
        parsed = asRecord(JSON.parse(line));
    }
    catch {
        if (debug)
            console.log(pc.gray(line));
        return;
    }
    if (!parsed)
        return;
    // 1. Init
    if (parsed.event === "init" || parsed.type === "init") {
        const convId = asString(parsed.conversation_id, asString(parsed.conversationId));
        console.log(pc.cyan(`\n● Antigravity Session ${convId ? pc.bold(convId.slice(0, 8)) : "initialized"}`));
        return;
    }
    // 2. Thinking
    const thinkingText = asString(parsed.thinking, parsed.event === "thinking" ? asString(parsed.content) : "");
    if (thinkingText.trim()) {
        console.log(pc.gray(`💭 ${thinkingText.trim()}`));
        return;
    }
    // 3. Tool Calls
    if (Array.isArray(parsed.tool_calls)) {
        for (const tcRaw of parsed.tool_calls) {
            const tc = asRecord(tcRaw);
            if (!tc)
                continue;
            const name = asString(tc.name, "tool");
            console.log(pc.yellow(`⚙️  Tool: ${pc.bold(name)}`));
            if (tc.args) {
                console.log(pc.gray(`   ${stringifyUnknown(tc.args)}`));
            }
        }
        return;
    }
    if (parsed.event === "tool_call" || parsed.type === "tool_call") {
        const name = asString(parsed.name, asString(parsed.tool, "tool"));
        console.log(pc.yellow(`⚙️  Tool: ${pc.bold(name)}`));
        const input = parsed.input ?? parsed.args;
        if (input) {
            console.log(pc.gray(`   ${stringifyUnknown(input)}`));
        }
        return;
    }
    // 4. Tool Result
    if (parsed.event === "tool_result" || parsed.type === "tool_result" || parsed.type === "tool_response") {
        const isError = parsed.is_error === true || asString(parsed.status).toLowerCase() === "error";
        const content = asString(parsed.content, asString(parsed.output, asString(parsed.result, "")));
        if (isError) {
            console.log(pc.red(`❌ Tool failed:`));
            if (content)
                console.log(pc.red(`   ${content}`));
        }
        else {
            console.log(pc.green(`✔️  Tool finished`));
            if (content && debug)
                console.log(pc.gray(`   ${content}`));
        }
        return;
    }
    // 5. Assistant Message
    if (parsed.type === "PLANNER_RESPONSE" || parsed.role === "assistant" || parsed.type === "assistant" || parsed.event === "message") {
        const content = asString(parsed.content, asString(parsed.text, ""));
        if (content.trim()) {
            console.log(pc.white(content));
        }
        return;
    }
    // 6. Result / Done
    if (parsed.event === "result" || parsed.status === "DONE") {
        const summary = asString(parsed.summary, "");
        console.log(pc.bold(pc.green(`\n🏁 Done`)));
        if (summary)
            console.log(pc.white(summary));
        const usage = asRecord(parsed.usage) ?? asRecord(parsed.usageMetadata);
        if (usage) {
            const inTok = usage.input_tokens ?? usage.inputTokens;
            const outTok = usage.output_tokens ?? usage.outputTokens;
            console.log(pc.gray(`Tokens: in=${inTok ?? "?"} out=${outTok ?? "?"}`));
        }
        return;
    }
    if (debug) {
        console.log(pc.gray(line));
    }
}
//# sourceMappingURL=format-event.js.map