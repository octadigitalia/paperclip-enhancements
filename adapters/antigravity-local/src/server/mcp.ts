import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  serverUrl?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
}

export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export function resolveMcpConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const customConfigDir = env.GEMINI_CONFIG_DIR?.trim();
  if (customConfigDir) {
    return path.join(customConfigDir, "mcp_config.json");
  }
  const homeDir = env.HOME?.trim() || os.homedir();
  return path.join(homeDir, ".gemini", "config", "mcp_config.json");
}

function normalizeServerConfig(raw: unknown): McpServerConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const normalized: McpServerConfig = {};

  if (typeof obj.disabled === "boolean") {
    normalized.disabled = obj.disabled;
  }

  const url = typeof obj.url === "string" && obj.url.trim().length > 0 ? obj.url.trim() : undefined;
  const serverUrl =
    typeof obj.serverUrl === "string" && obj.serverUrl.trim().length > 0 ? obj.serverUrl.trim() : undefined;

  if (url || serverUrl) {
    const finalUrl = serverUrl || url;
    normalized.serverUrl = finalUrl;
    normalized.url = finalUrl;
  }

  if (typeof obj.command === "string" && obj.command.trim().length > 0) {
    normalized.command = obj.command.trim();
  }

  if (Array.isArray(obj.args)) {
    normalized.args = obj.args.map((a) => String(a));
  }

  if (obj.headers && typeof obj.headers === "object" && !Array.isArray(obj.headers)) {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.headers)) {
      if (typeof v === "string") headers[k] = v;
    }
    normalized.headers = headers;
  }

  if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
    const envVars: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.env)) {
      if (typeof v === "string") envVars[k] = v;
    }
    normalized.env = envVars;
  }

  return normalized;
}

export async function syncMcpConfig(input: {
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<string[]> {
  const mcpConfigPath = resolveMcpConfigPath(input.env);
  let fileContent: McpConfigFile = { mcpServers: {} };
  let modified = false;

  try {
    const raw = await fs.readFile(mcpConfigPath, "utf-8");
    const parsed = parseJson(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const existingServers = parseObject(obj.mcpServers);
      const normalizedExisting: Record<string, McpServerConfig> = {};
      for (const [name, serverDef] of Object.entries(existingServers)) {
        const norm = normalizeServerConfig(serverDef);
        if (norm) {
          normalizedExisting[name] = norm;
        }
      }
      fileContent.mcpServers = normalizedExisting;
    }
  } catch (err: unknown) {
    // If file does not exist or is empty, we initialize a fresh one
    fileContent = { mcpServers: {} };
    modified = true;
  }

  if (!fileContent.mcpServers) {
    fileContent.mcpServers = {};
    modified = true;
  }

  // Check incoming MCP server configurations
  const candidateSources: unknown[] = [
    input.config.mcpServers,
    input.config.mcp,
    input.context.mcpServers,
    input.context.runtimeMcp,
  ];

  for (const candidate of candidateSources) {
    if (!candidate) continue;

    let serversMap: Record<string, unknown> = {};

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = parseJson(candidate.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        serversMap = (parsed as Record<string, unknown>).mcpServers
          ? parseObject((parsed as Record<string, unknown>).mcpServers)
          : (parsed as Record<string, unknown>);
      }
    } else if (typeof candidate === "object" && !Array.isArray(candidate)) {
      const obj = candidate as Record<string, unknown>;
      serversMap = obj.mcpServers ? parseObject(obj.mcpServers) : obj;
    } else if (Array.isArray(candidate)) {
      // Support runtimeMcp array format [{ name, url, token, headers, command, args, env }]
      for (const item of candidate) {
        if (item && typeof item === "object" && "name" in item && typeof (item as any).name === "string") {
          const itemObj = item as Record<string, unknown>;
          const serverName = String(itemObj.name).trim();
          const serverConfig: Record<string, unknown> = { ...itemObj };
          if (itemObj.token && typeof itemObj.token === "string") {
            serverConfig.headers = {
              ...(parseObject(itemObj.headers) as Record<string, string>),
              Authorization: `Bearer ${itemObj.token}`,
            };
          }
          serversMap[serverName] = serverConfig;
        }
      }
    }

    for (const [name, rawDef] of Object.entries(serversMap)) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;
      const normalized = normalizeServerConfig(rawDef);
      if (normalized) {
        const current = fileContent.mcpServers[trimmedName];
        if (JSON.stringify(current) !== JSON.stringify(normalized)) {
          fileContent.mcpServers[trimmedName] = normalized;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    try {
      await fs.mkdir(path.dirname(mcpConfigPath), { recursive: true });
      await fs.writeFile(mcpConfigPath, JSON.stringify(fileContent, null, 2), "utf-8");
    } catch (writeErr: unknown) {
      if (input.onLog) {
        await input.onLog(
          "stdout",
          `[paperclip] Warning: failed to write MCP config at "${mcpConfigPath}": ${
            writeErr instanceof Error ? writeErr.message : String(writeErr)
          }\n`,
        );
      }
    }
  }

  const activeServers = Object.entries(fileContent.mcpServers)
    .filter(([_, conf]) => conf.disabled !== true)
    .map(([name]) => name);

  return activeServers;
}
