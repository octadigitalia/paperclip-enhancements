import { asNumber, asString, parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

export interface ParsedAntigravityUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface ParsedAntigravityOutput {
  conversationId: string | null;
  messages: string[];
  summary: string | null;
  errorMessage: string | null;
  usage: ParsedAntigravityUsage;
  costUsd: number | null;
  resultJson: Record<string, unknown> | null;
}

function readConversationId(event: Record<string, unknown>): string | null {
  return (
    asString(event.conversation_id, "").trim() ||
    asString(event.conversationId, "").trim() ||
    asString(event.session_id, "").trim() ||
    asString(event.sessionId, "").trim() ||
    asString(event.sessionID, "").trim() ||
    null
  );
}

function accumulateUsage(target: ParsedAntigravityUsage, usageRaw: unknown) {
  const usage = parseObject(usageRaw);
  const metadata = parseObject(usage.usageMetadata);
  const src = Object.keys(metadata).length > 0 ? metadata : usage;

  target.inputTokens += asNumber(
    src.input_tokens,
    asNumber(src.inputTokens, asNumber(src.promptTokenCount, 0)),
  );
  target.cachedInputTokens += asNumber(
    src.cached_input_tokens,
    asNumber(
      src.cache_read_tokens,
      asNumber(
        src.cachedInputTokens,
        asNumber(src.cachedContentTokenCount, asNumber(src.cached, 0)),
      ),
    ),
  );
  target.outputTokens += asNumber(
    src.output_tokens,
    asNumber(src.outputTokens, asNumber(src.candidatesTokenCount, 0)),
  );
}

export function parseAntigravityJsonl(stdout: string): ParsedAntigravityOutput {
  let conversationId: string | null = null;
  const messages: string[] = [];
  let errorMessage: string | null = null;
  let costUsd: number | null = null;
  let resultJson: Record<string, unknown> | null = null;
  const usage: ParsedAntigravityUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const foundId = readConversationId(event);
    if (foundId) conversationId = foundId;

    if (event.usage || event.usageMetadata || event.stats) {
      accumulateUsage(usage, event.usage ?? event.usageMetadata ?? event.stats);
    }

    if (typeof event.cost_usd === "number" || typeof event.costUsd === "number") {
      costUsd = asNumber(event.cost_usd ?? event.costUsd, 0);
    }

    // Check for error payloads
    if (event.error || event.status === "ERROR") {
      const err = event.error ?? event.message ?? event.detail;
      if (typeof err === "string") {
        errorMessage = err;
      } else if (typeof err === "object" && err !== null) {
        const errObj = err as Record<string, unknown>;
        errorMessage = asString(errObj.message, asString(errObj.error, "Unknown error"));
      }
    }

    // Check for step_update agent_response content
    if (event.event === "step_update" && event.step_update) {
      const su = parseObject(event.step_update);
      if (su.step_type === "agent_response") {
        const content = asString(su.content, asString(su.text, "")).trim();
        if (content) messages.push(content);
      }
    }

    // Check for text content / assistant messages
    if (typeof event.response === "string" && event.response.trim()) {
      messages.push(event.response.trim());
    } else if (event.type === "PLANNER_RESPONSE" || event.role === "assistant" || event.type === "assistant") {
      const content = asString(event.content, asString(event.text, "")).trim();
      if (content) messages.push(content);
    } else if (event.event === "assistant" || event.event === "message") {
      const content = asString(event.content, asString(event.text, "")).trim();
      if (content) messages.push(content);
    }

    if (event.event === "result" || event.status === "DONE" || event.status === "SUCCESS") {
      resultJson = event;
      const resObj = (typeof event.result === "object" && event.result !== null) ? parseObject(event.result) : null;
      const resp = asString(event.response, asString(resObj?.response, asString(resObj?.content, asString(event.summary, ""))));
      if (resp.trim()) {
        messages.push(resp.trim());
      }
    }
  }

  const summary = messages.length > 0 ? messages[messages.length - 1] : null;

  return {
    conversationId,
    messages,
    summary,
    errorMessage,
    usage,
    costUsd,
    resultJson,
  };
}

export function isAntigravityUnknownSessionError(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return (
    combined.includes("conversation not found") ||
    combined.includes("unknown conversation") ||
    combined.includes("invalid conversation id") ||
    combined.includes("cannot resume conversation") ||
    combined.includes("session not found") ||
    combined.includes("no conversation with id")
  );
}

export function detectAntigravityAuthRequired(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  return (
    combined.includes("not authenticated") ||
    combined.includes("authentication required") ||
    combined.includes("run agy login") ||
    combined.includes("login required") ||
    combined.includes("invalid credentials") ||
    combined.includes("auth credentials not found")
  );
}

export function describeAntigravityFailure(
  exitCode: number | null,
  signal: string | null,
  stdout: string,
  stderr: string,
  parsedError: string | null,
): string {
  if (parsedError) return parsedError;
  const stderrLine = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (stderrLine) return stderrLine;

  if (signal) return `Antigravity CLI terminated by signal ${signal}`;
  if (exitCode !== null && exitCode !== 0) return `Antigravity CLI exited with code ${exitCode}`;
  return "Antigravity CLI run completed without a structured result";
}
