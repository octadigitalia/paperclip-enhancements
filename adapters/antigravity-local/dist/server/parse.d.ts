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
export declare function parseAntigravityJsonl(stdout: string): ParsedAntigravityOutput;
export declare function isAntigravityUnknownSessionError(stdout: string, stderr: string): boolean;
export declare function detectAntigravityAuthRequired(stdout: string, stderr: string): boolean;
export declare function describeAntigravityFailure(exitCode: number | null, signal: string | null, stdout: string, stderr: string, parsedError: string | null): string;
//# sourceMappingURL=parse.d.ts.map