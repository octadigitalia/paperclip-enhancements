import type { AdapterSessionCodec, ServerAdapterModule } from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { listAntigravitySkills, syncAntigravitySkills } from "./skills.js";
import { parseAntigravityJsonl, isAntigravityUnknownSessionError, detectAntigravityAuthRequired, describeAntigravityFailure } from "./parse.js";
import { getConfigSchema } from "./config-schema.js";
import { syncMcpConfig, resolveMcpConfigPath } from "./mcp.js";
export { execute, testEnvironment, listAntigravitySkills, syncAntigravitySkills, parseAntigravityJsonl, isAntigravityUnknownSessionError, detectAntigravityAuthRequired, describeAntigravityFailure, getConfigSchema, syncMcpConfig, resolveMcpConfigPath, };
export declare const sessionCodec: AdapterSessionCodec;
export declare function createServerAdapter(): ServerAdapterModule;
//# sourceMappingURL=index.d.ts.map