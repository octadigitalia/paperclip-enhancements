import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { models, DEFAULT_ANTIGRAVITY_LOCAL_MODEL } from "../index.js";

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "cwd",
        label: "Working directory",
        type: "text",
        hint: "Absolute directory path for the agent workspace (e.g. /paperclip/workspaces/sara).",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        default: DEFAULT_ANTIGRAVITY_LOCAL_MODEL,
        options: [
          { value: "auto", label: "Auto (Default)" },
          { value: "claude-sonnet-5-5-medium", label: "Claude Sonnet 5.5 (Medium Effort)" },
          { value: "claude-sonnet-5-5-high", label: "Claude Sonnet 5.5 (High Effort)" },
          { value: "claude-opus-5-5-medium", label: "Claude Opus 5.5 (Medium Effort)" },
          { value: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High Effort)" },
          { value: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
          { value: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
          { value: "gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
        ],
        hint: "Select the primary AI model for this agent.",
      },
      {
        key: "instructionsFilePath",
        label: "Instructions file path",
        type: "text",
        hint: "Absolute path to markdown instructions file (e.g. /paperclip/workspaces/sara/prompts/system-prompt.md).",
      },
      {
        key: "dangerouslySkipPermissions",
        label: "Auto-approve tool permissions",
        type: "toggle",
        default: true,
        hint: "Enables autonomous execution without prompting for interactive confirmation.",
      },
      {
        key: "effort",
        label: "Reasoning effort",
        type: "select",
        default: "medium",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "max", label: "Max" },
        ],
        hint: "Controls the amount of reasoning effort for thinking models.",
      },
      {
        key: "timeoutSec",
        label: "Execution timeout (seconds)",
        type: "number",
        default: 600,
        hint: "Maximum execution duration before terminating the turn.",
      },
      {
        key: "mcpServers",
        label: "MCP Servers (JSON)",
        type: "text",
        hint: "Optional JSON object mapping server names to MCP configuration (url, headers, command, args, env).",
      },
    ],
  };
}
