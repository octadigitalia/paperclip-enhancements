import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

export function resolveMcpConfigPath(env = process.env) {
    const customConfigDir = env.GEMINI_CONFIG_DIR?.trim();
    if (customConfigDir) {
        return path.join(customConfigDir, "mcp_config.json");
    }
    const homeDir = env.HOME?.trim() || os.homedir();
    return path.join(homeDir, ".gemini", "config", "mcp_config.json");
}

function normalizeServerConfig(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return null;
    }
    const obj = raw;
    const normalized = {};
    if (typeof obj.disabled === "boolean") {
        normalized.disabled = obj.disabled;
    }
    const url = typeof obj.url === "string" && obj.url.trim().length > 0 ? obj.url.trim() : undefined;
    const serverUrl = typeof obj.serverUrl === "string" && obj.serverUrl.trim().length > 0 ? obj.serverUrl.trim() : undefined;
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
        const headers = {};
        for (const [k, v] of Object.entries(obj.headers)) {
            if (typeof v === "string")
                headers[k] = v;
        }
        normalized.headers = headers;
    }
    if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
        const envVars = {};
        for (const [k, v] of Object.entries(obj.env)) {
            if (typeof v === "string")
                envVars[k] = v;
        }
        normalized.env = envVars;
    }
    return normalized;
}

export async function syncMcpConfig(input) {
    const mcpConfigPath = resolveMcpConfigPath(input.env);
    let fileContent = { mcpServers: {} };
    let modified = false;
    try {
        const raw = await fs.readFile(mcpConfigPath, "utf-8");
        const parsed = parseJson(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const obj = parsed;
            const existingServers = parseObject(obj.mcpServers);
            const normalizedExisting = {};
            for (const [name, serverDef] of Object.entries(existingServers)) {
                const norm = normalizeServerConfig(serverDef);
                if (norm) {
                    normalizedExisting[name] = norm;
                }
            }
            fileContent.mcpServers = normalizedExisting;
        }
    }
    catch (err) {
        fileContent = { mcpServers: {} };
        modified = true;
    }
    if (!fileContent.mcpServers) {
        fileContent.mcpServers = {};
        modified = true;
    }
    const candidateSources = [
        input.config.mcpServers,
        input.config.mcp,
        input.context.mcpServers,
        input.context.runtimeMcp,
    ];
    for (const candidate of candidateSources) {
        if (!candidate)
            continue;
        let serversMap = {};
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            const parsed = parseJson(candidate.trim());
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                serversMap = parsed.mcpServers
                    ? parseObject(parsed.mcpServers)
                    : parsed;
            }
        }
        else if (typeof candidate === "object" && !Array.isArray(candidate)) {
            const obj = candidate;
            serversMap = obj.mcpServers ? parseObject(obj.mcpServers) : obj;
        }
        else if (Array.isArray(candidate)) {
            for (const item of candidate) {
                if (item && typeof item === "object" && "name" in item && typeof item.name === "string") {
                    const itemObj = item;
                    const serverName = String(itemObj.name).trim();
                    const serverConfig = { ...itemObj };
                    if (itemObj.token && typeof itemObj.token === "string") {
                        serverConfig.headers = {
                            ...parseObject(itemObj.headers),
                            Authorization: `Bearer ${itemObj.token}`,
                        };
                    }
                    serversMap[serverName] = serverConfig;
                }
            }
        }
        for (const [name, rawDef] of Object.entries(serversMap)) {
            const trimmedName = name.trim();
            if (!trimmedName)
                continue;
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
        }
        catch (writeErr) {
            if (input.onLog) {
                await input.onLog("stdout", `[paperclip] Warning: failed to write MCP config at "${mcpConfigPath}": ${writeErr instanceof Error ? writeErr.message : String(writeErr)}\n`);
            }
        }
    }
    const activeServers = Object.entries(fileContent.mcpServers)
        .filter(([_, conf]) => conf.disabled !== true)
        .map(([name]) => name);
    return activeServers;
}