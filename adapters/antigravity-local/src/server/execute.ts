import { createProviderStoppedBoundary } from "@paperclipai/adapter-utils/provider-stopped-boundary";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
} from "@paperclipai/adapter-utils";
import {
  adapterExecutionTargetIsRemote,
  adapterExecutionTargetRemoteCwd,
  readAdapterExecutionTarget,
  runAdapterExecutionTargetProcess,
} from "@paperclipai/adapter-utils/execution-target";
import {
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  parseObject,
  buildPaperclipEnv,
  ensureAbsoluteDirectory,
  ensurePathInEnv,
  renderTemplate,
  renderPaperclipWakePrompt,
  joinPromptSections,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";
import {
  parseAntigravityJsonl,
  isAntigravityUnknownSessionError,
  detectAntigravityAuthRequired,
  describeAntigravityFailure,
} from "./parse.js";
import { buildIsolatedSkillsDir } from "./skills.js";
import { syncMcpConfig } from "./mcp.js";
import { DEFAULT_ANTIGRAVITY_LOCAL_MODEL } from "../index.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const providerStop = createProviderStoppedBoundary(ctx.onProviderStopped);
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;
  const executionTarget = readAdapterExecutionTarget({
    executionTarget: ctx.executionTarget,
    legacyRemoteExecution: ctx.executionTransport?.remoteExecution,
  });
  const executionTargetIsRemote = adapterExecutionTargetIsRemote(executionTarget);

  const promptTemplate = asString(
    config.promptTemplate,
    DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  );
  const command = asString(config.command, "agy");
  const model = asString(config.model, DEFAULT_ANTIGRAVITY_LOCAL_MODEL).trim();
  const effort = asString(config.effort, "").trim();
  const mode = asString(config.mode, "").trim();
  const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, true);
  const sandbox = asBoolean(config.sandbox, false);
  const timeoutSec = Math.max(30, asNumber(config.timeoutSec, 600));
  const graceSec = Math.max(5, asNumber(config.graceSec, 15));

  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  const workspaceSource = asString(workspaceContext.source, "");
  const configuredCwd = asString(config.cwd, "");
  const useConfiguredInsteadOfAgentHome = workspaceSource === "agent_home" && configuredCwd.length > 0;
  const effectiveWorkspaceCwd = useConfiguredInsteadOfAgentHome ? "" : workspaceCwd;
  const cwd = effectiveWorkspaceCwd || configuredCwd || process.cwd();
  const effectiveExecutionCwd = adapterExecutionTargetRemoteCwd(executionTarget, cwd);

  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  // Environment variables
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim()) ||
    null;
  const wakeReason = typeof context.wakeReason === "string" && context.wakeReason.trim() ? context.wakeReason.trim() : null;
  const wakeCommentId =
    (typeof context.wakeCommentId === "string" && context.wakeCommentId.trim()) ||
    (typeof context.commentId === "string" && context.commentId.trim()) ||
    null;
  const approvalId = typeof context.approvalId === "string" && context.approvalId.trim() ? context.approvalId.trim() : null;
  const approvalStatus = typeof context.approvalStatus === "string" && context.approvalStatus.trim() ? context.approvalStatus.trim() : null;

  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;
  if (wakeCommentId) env.PAPERCLIP_WAKE_COMMENT_ID = wakeCommentId;
  if (approvalId) env.PAPERCLIP_APPROVAL_ID = approvalId;
  if (approvalStatus) env.PAPERCLIP_APPROVAL_STATUS = approvalStatus;

  if (authToken && !env.PAPERCLIP_API_KEY) {
    env.PAPERCLIP_API_KEY = authToken;
  }

  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }

  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  // Session management: conversation ID and cwd resolution
  const runtimeSessionParams = parseObject(runtime.sessionParams);
  const runtimeConversationId =
    asString(runtimeSessionParams.conversationId, "") ||
    asString(runtimeSessionParams.sessionId, "") ||
    asString(runtime.sessionId, "");
  const runtimeSessionCwd = asString(runtimeSessionParams.cwd, "");

  const canResumeSession =
    runtimeConversationId.length > 0 &&
    (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(effectiveExecutionCwd));

  const conversationId = canResumeSession ? runtimeConversationId : null;

  // Instructions file
  const instructionsFilePath = asString(config.instructionsFilePath, "").trim();
  let instructionsPrefix = "";
  if (instructionsFilePath) {
    runtimeEnv.AGENT_HOME = path.dirname(instructionsFilePath);
    try {
      const content = await fs.readFile(instructionsFilePath, "utf-8");
      instructionsPrefix = content.trim();
    } catch (err) {
      await onLog(
        "stdout",
        `[paperclip] Warning: could not read instructions file "${instructionsFilePath}": ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  // Prompt assembly
  const templateData = {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  };

  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake, { resumedSession: Boolean(conversationId) });
  const renderedPrompt = renderTemplate(promptTemplate, templateData);
  const sessionHandoffNote = asString(context.paperclipSessionHandoffMarkdown, "").trim();

  const prompt = joinPromptSections([
    instructionsPrefix,
    wakePrompt,
    sessionHandoffNote,
    renderedPrompt,
  ]);

  // Skills directory setup
  let isolatedSkillsDir: string | null = null;
  try {
    isolatedSkillsDir = await buildIsolatedSkillsDir(config);
  } catch {
    isolatedSkillsDir = null;
  }

  // MCP servers setup
  let activeMcpServers: string[] = [];
  try {
    activeMcpServers = await syncMcpConfig({
      config,
      context,
      env: runtimeEnv,
      onLog,
    });
  } catch (mcpErr) {
    if (onLog) {
      await onLog(
        "stdout",
        `[paperclip] Warning: failed syncing MCP config: ${mcpErr instanceof Error ? mcpErr.message : String(mcpErr)}\n`,
      );
    }
  }

  const extraArgs = asStringArray(config.extraArgs);

  const buildArgs = (resumeConvId: string | null) => {
    const args = [
      "--output-format",
      "stream-json",
      "--input-format",
      "text",
      "--print-timeout",
      "55m",
    ];

    if (dangerouslySkipPermissions) {
      args.push("--dangerously-skip-permissions");
    }

    if (sandbox) {
      args.push("--sandbox");
    }

    if (model && model !== DEFAULT_ANTIGRAVITY_LOCAL_MODEL) {
      args.push("--model", model);
    }

    if (effort) {
      args.push("--effort", effort);
    }

    if (mode) {
      args.push("--mode", mode);
    }

    if (resumeConvId) {
      args.push("--conversation", resumeConvId);
    }

    if (isolatedSkillsDir) {
      args.push("--add-dir", isolatedSkillsDir);
    }

    if (extraArgs.length > 0) {
      args.push(...extraArgs);
    }

    // Pass prompt attached to --print so agy doesn't consume subsequent flags
    args.push(`--print=${prompt}`);

    return args;
  };

  if (onMeta) {
    await onMeta({
      adapterType: "antigravity_local",
      command,
      cwd: effectiveExecutionCwd,
      env: runtimeEnv,
      commandNotes: [
        `Antigravity CLI execution using headless --print mode.`,
        ...(dangerouslySkipPermissions ? ["Auto-approving tool permissions with --dangerously-skip-permissions."] : []),
        ...(conversationId ? [`Resuming conversation: ${conversationId}`] : ["Starting fresh conversation."]),
        ...(activeMcpServers.length > 0 ? [`Active MCP servers: ${activeMcpServers.join(", ")}`] : []),
      ],
    });
  }

  const runAttempt = async (attemptConvId: string | null) => {
    const args = buildArgs(attemptConvId);
    return runAdapterExecutionTargetProcess(
      runId,
      executionTarget,
      command,
      args,
      {
        onProcessStopped: providerStop.beginInvocation(),
        cwd: effectiveExecutionCwd,
        env: runtimeEnv,
        timeoutSec,
        graceSec,
        onLog,
      },
    );
  };

  const toResult = (
    attemptProc: Awaited<ReturnType<typeof runAttempt>>,
    parsed: ReturnType<typeof parseAntigravityJsonl>,
    clearSessionOnFailure = false,
  ): AdapterExecutionResult => {
    if (attemptProc.timedOut) {
      return {
        exitCode: attemptProc.exitCode,
        signal: attemptProc.signal,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        clearSession: clearSessionOnFailure,
      };
    }

    const failed = (attemptProc.exitCode ?? 0) !== 0;
    const isAuthRequired = detectAntigravityAuthRequired(attemptProc.stdout, attemptProc.stderr);
    const failureMsg = failed
      ? describeAntigravityFailure(
          attemptProc.exitCode,
          attemptProc.signal,
          attemptProc.stdout,
          attemptProc.stderr,
          parsed.errorMessage,
        )
      : null;

    const resolvedConvId = parsed.conversationId || conversationId;
    const resolvedSessionParams = resolvedConvId
      ? {
          conversationId: resolvedConvId,
          cwd: effectiveExecutionCwd,
        }
      : null;

    return {
      exitCode: attemptProc.exitCode,
      signal: attemptProc.signal,
      timedOut: false,
      errorMessage: failureMsg,
      errorCode: isAuthRequired ? "antigravity_auth_required" : null,
      usage: parsed.usage,
      sessionId: resolvedConvId,
      sessionParams: resolvedSessionParams,
      sessionDisplayId: resolvedConvId,
      model,
      costUsd: parsed.costUsd,
      summary: parsed.summary,
      resultJson: {
        ...(parsed.resultJson ?? {
          stdout: attemptProc.stdout,
          stderr: attemptProc.stderr,
        }),
        summary: parsed.summary,
        finalResponse: parsed.summary
          ? {
              disposition: "final",
              text: parsed.summary,
            }
          : undefined,
      },
      clearSession: clearSessionOnFailure,
    };
  };

  try {
    const initialProc = await runAttempt(conversationId);
    let parsed = parseAntigravityJsonl(initialProc.stdout);

    // If conversation resume failed with unknown conversation, retry once with a fresh conversation
    if (
      conversationId &&
      !initialProc.timedOut &&
      (initialProc.exitCode ?? 0) !== 0 &&
      isAntigravityUnknownSessionError(initialProc.stdout, initialProc.stderr)
    ) {
      await onLog(
        "stdout",
        `[paperclip] Antigravity conversation "${conversationId}" cannot be resumed; retrying with a fresh conversation.\n`,
      );
      const retryProc = await runAttempt(null);
      parsed = parseAntigravityJsonl(retryProc.stdout);
      return toResult(retryProc, parsed, true);
    }

    return toResult(initialProc, parsed);
  } finally {
    try {
      await providerStop.collectBeforeRestore();
    } finally {
      if (isolatedSkillsDir) {
        await fs.rm(path.dirname(isolatedSkillsDir), { recursive: true, force: true }).catch(() => {});
      }
    }
  }
}
