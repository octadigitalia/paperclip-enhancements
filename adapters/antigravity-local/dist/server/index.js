import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { listAntigravitySkills, syncAntigravitySkills } from "./skills.js";
import { parseAntigravityJsonl, isAntigravityUnknownSessionError, detectAntigravityAuthRequired, describeAntigravityFailure, } from "./parse.js";
import { type, models, agentConfigurationDoc, } from "../index.js";
import { getConfigSchema } from "./config-schema.js";
import { syncMcpConfig, resolveMcpConfigPath } from "./mcp.js";
export { execute, testEnvironment, listAntigravitySkills, syncAntigravitySkills, parseAntigravityJsonl, isAntigravityUnknownSessionError, detectAntigravityAuthRequired, describeAntigravityFailure, getConfigSchema, syncMcpConfig, resolveMcpConfigPath, };
function readNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
export const sessionCodec = {
    deserialize(raw) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw))
            return null;
        const record = raw;
        const conversationId = readNonEmptyString(record.conversationId) ??
            readNonEmptyString(record.conversation_id) ??
            readNonEmptyString(record.sessionId) ??
            readNonEmptyString(record.session_id);
        if (!conversationId)
            return null;
        const cwd = readNonEmptyString(record.cwd) ??
            readNonEmptyString(record.workdir) ??
            readNonEmptyString(record.folder);
        return {
            conversationId,
            ...(cwd ? { cwd } : {}),
        };
    },
    serialize(params) {
        if (!params)
            return null;
        const conversationId = readNonEmptyString(params.conversationId) ??
            readNonEmptyString(params.conversation_id) ??
            readNonEmptyString(params.sessionId) ??
            readNonEmptyString(params.session_id);
        if (!conversationId)
            return null;
        const cwd = readNonEmptyString(params.cwd) ??
            readNonEmptyString(params.workdir) ??
            readNonEmptyString(params.folder);
        return {
            conversationId,
            ...(cwd ? { cwd } : {}),
        };
    },
    getDisplayId(params) {
        if (!params)
            return null;
        const id = readNonEmptyString(params.conversationId) ??
            readNonEmptyString(params.conversation_id) ??
            readNonEmptyString(params.sessionId) ??
            readNonEmptyString(params.session_id);
        return id ? (id.length > 8 ? id.slice(0, 8) : id) : null;
    },
};
export function createServerAdapter() {
    return {
        type,
        execute,
        testEnvironment,
        sessionCodec,
        models,
        agentConfigurationDoc,
        supportsLocalAgentJwt: true,
        supportsInstructionsBundle: true,
        instructionsPathKey: "instructionsFilePath",
        requiresMaterializedRuntimeSkills: true,
        listSkills: listAntigravitySkills,
        syncSkills: syncAntigravitySkills,
        getConfigSchema,
    };
}
//# sourceMappingURL=index.js.map