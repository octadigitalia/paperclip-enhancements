import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  ensurePathInEnv,
  parseObject,
} from "@paperclipai/adapter-utils/server-utils";
import {
  ensureAdapterExecutionTargetDirectory,
  resolveAdapterExecutionTargetCwd,
  runAdapterExecutionTargetProcess,
  describeAdapterExecutionTarget,
} from "@paperclipai/adapter-utils/execution-target";
import { detectAntigravityAuthRequired, parseAntigravityJsonl } from "./parse.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const command = asString(config.command, "agy");
  const target = ctx.executionTarget ?? null;
  const targetIsRemote = target?.kind === "remote";
  const cwd = resolveAdapterExecutionTargetCwd(target, asString(config.cwd, ""), process.cwd());
  const targetLabel = targetIsRemote
    ? ctx.environmentName ?? describeAdapterExecutionTarget(target)
    : null;
  const runId = `agy-envtest-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (targetLabel) {
    checks.push({
      code: "antigravity_environment_target",
      level: "info",
      message: `Probing inside environment: ${targetLabel}`,
    });
  }

  // 1. Check working directory
  try {
    await ensureAdapterExecutionTargetDirectory(runId, target, cwd, {
      cwd,
      env: {},
      createIfMissing: true,
    });
    checks.push({
      code: "antigravity_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "antigravity_cwd_invalid",
      level: "error",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
    });
  }

  // 2. Check executable and version probe
  const envConfig = parseObject(config.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
  }
  const runtimeEnv = ensurePathInEnv({ ...process.env, ...env });

  try {
    const probe = await runAdapterExecutionTargetProcess(
      runId,
      target,
      command,
      ["--version"],
      {
        cwd,
        env: runtimeEnv,
        timeoutSec: 10,
        graceSec: 3,
        onLog: async () => {},
      },
    );

    if (probe.exitCode === 0) {
      const versionStr = probe.stdout.trim() || "detected";
      checks.push({
        code: "antigravity_cli_detected",
        level: "info",
        message: `Antigravity CLI (${command}) detected: v${versionStr}`,
      });
    } else {
      checks.push({
        code: "antigravity_cli_probe_failed",
        level: "error",
        message: `Antigravity CLI returned exit code ${probe.exitCode}`,
        detail: probe.stderr.trim() || probe.stdout.trim() || null,
        hint: `Verify that "${command}" is properly installed and executable.`,
      });
    }
  } catch (err) {
    checks.push({
      code: "antigravity_cli_not_found",
      level: "error",
      message: `Could not execute Antigravity CLI command: "${command}"`,
      detail: err instanceof Error ? err.message : String(err),
      hint: `Make sure "agy" is in your system PATH, or specify the full path in the command field.`,
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
