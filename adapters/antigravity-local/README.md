# Paperclip Adapter: Google Antigravity CLI (Local)

External adapter plugin for [Paperclip](https://github.com/paperclipai/paperclip) that enables local execution of the Google Antigravity CLI (`agy`).

## Features

- **Autonomous Execution**: Uses headless `--print` mode with `--dangerously-skip-permissions` for unattended agent runs.
- **Persistent Sessions**: Supports multi-turn conversations and heartbeat resumptions via `--conversation <id>` or `--continue`.
- **Real-Time UI Streaming**: Fully supports Antigravity `stream-json` event format (`step_update`), displaying tool calls, tool results, thinking blocks, and token usage live in the Paperclip UI.
- **Skills Management**: Seamlessly integrates Paperclip company skills via `--add-dir`, materializing runtime skills without polluting the workspace repository.
- **Custom Config Schema**: Configurable models (Gemini Flash, Gemini Pro, Claude via Antigravity, etc.), effort levels (low, medium, high, max), timeouts, and working directories.

## Project Structure

- `src/index.ts`: Adapter metadata, model definitions, and profile configurations.
- `src/server/index.ts`: Server adapter module factory (`createServerAdapter`), skills integration (`listSkills`, `syncSkills`), and session codecs.
- `src/server/execute.ts`: Execution engine running `agy` processes and handling retries/timeouts.
- `src/server/config-schema.ts`: Settings schema exposed to the Paperclip web interface.
- `src/server/skills.ts`: Skill snapshot resolution and symlink management (`~/.gemini/skills`).
- `src/ui-parser.ts`: Zero-dependency browser-safe transcript parser compliant with Paperclip UI parser contract `1.0.0`.
- `dist/`: Pre-compiled JavaScript distribution ready for direct Paperclip plugin loading.

## License

MIT - OctaDigital
