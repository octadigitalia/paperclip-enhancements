import type { AdapterSkillContext, AdapterSkillSnapshot } from "@paperclipai/adapter-utils";
export declare function resolveAntigravitySkillsHome(config: Record<string, unknown>): string;
export declare function buildIsolatedSkillsDir(config: Record<string, unknown>): Promise<string>;
export declare function buildAntigravitySkillSnapshot(config: Record<string, unknown>): Promise<AdapterSkillSnapshot>;
export declare function listAntigravitySkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot>;
export declare function syncAntigravitySkills(ctx: AdapterSkillContext, desiredSkills: string[]): Promise<AdapterSkillSnapshot>;
//# sourceMappingURL=skills.d.ts.map