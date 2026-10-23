import type { AdapterModelProfileDefinition } from "@paperclipai/adapter-utils";

export const type = "antigravity_local";
export const label = "Antigravity CLI (local)";

export const DEFAULT_ANTIGRAVITY_LOCAL_MODEL = "gemini-3.8-flash";

export const models = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash Medium" },
  { id: "gemini-3.1-pro", label: "Gemini 3.1 Pro" },
  { id: "auto", label: "Auto" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
];

export const modelProfiles: AdapterModelProfileDefinition[] = [
  {
    key: "cheap",
    label: "Cheap",
    description: "Use Gemini Flash Lite as the budget Antigravity CLI lane while preserving the primary model.",
    adapterConfig: {
      model: "gemini-2.5-flash-lite",
      effort: "low",
    },
    source: "adapter_default",
  },
];

export const agentConfigurationDoc = `# antigravity_local agent configuration

Adapter: antigravity_local

Use when:
- You want Paperclip to run the Google Antigravity CLI ('agy') locally on the host machine.
- You need persistent conversations resumed across heartbeats using '--conversation <id>' or '--continue'.
- You want autonomous, unattended execution via '--dangerously-skip-permissions' and headless '--print' mode.
- You want Paperclip skills injected cleanly via '--add-dir' without polluting the user's repository.
- The task requires Antigravity's agentic tools, multi-agent capabilities, or custom CLI commands.

Don't use when:
- The Antigravity CLI ('agy') is not installed on the machine running Paperclip.
- You only need a one-shot shell script without an AI development loop (use the 'process' adapter instead).
- You require remote webhook/HTTP agent dispatching (use 'http' or 'openclaw_gateway').

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file injected into the prompt
- promptTemplate (string, optional): run prompt template
- model (string, optional): model identifier passed to 'agy --model' (default: auto)
- effort (string, optional): reasoning effort passed to 'agy --effort' (low | medium | high)
- mode (string, optional): agent execution mode passed to 'agy --mode' (accept-edits | plan)
- dangerouslySkipPermissions (boolean, optional, default: true): pass '--dangerously-skip-permissions' for unattended runs
- sandbox (boolean, optional, default: false): pass '--sandbox' to enable terminal restrictions
- command (string, optional): CLI executable name or path, defaults to "agy"
- extraArgs (string[], optional): additional CLI args passed to 'agy'
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (default: 600)
- graceSec (number, optional): SIGTERM grace period in seconds (default: 15)

Notes:
- Runs use non-interactive '--print <prompt>' mode with '--output-format stream-json'.
- Conversations resume with '--conversation <conversationId>' when stored conversation cwd matches current cwd.
- Paperclip auto-injects skills via '--add-dir <tmpdir>' so the workspace repository remains untouched.
`;

export { createServerAdapter } from "./server/index.js";
