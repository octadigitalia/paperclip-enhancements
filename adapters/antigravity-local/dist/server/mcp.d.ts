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
export declare function resolveMcpConfigPath(env?: NodeJS.ProcessEnv): string;
export declare function syncMcpConfig(input: {
    config: Record<string, unknown>;
    context: Record<string, unknown>;
    env?: NodeJS.ProcessEnv;
    onLog?: (stream: "stdout" | "stderr", chunk: string) => Promise<void>;
}): Promise<string[]>;