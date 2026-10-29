const fs = require('fs');

console.log('[patch] Running Paperclip runtime patches on dist and src...');

let uiModified = false;

// 1. CLAUDE LOCAL ADAPTER (src & dist if any)
try {
  const claudePath = '/app/packages/adapters/claude-local/src/index.ts';
  if (fs.existsSync(claudePath)) {
    let claude = fs.readFileSync(claudePath, 'utf-8');
    claude = claude.replace(
      'export const DEFAULT_CLAUDE_LOCAL_MODEL = "claude-opus-5";',
      'export const DEFAULT_CLAUDE_LOCAL_MODEL = "claude-sonnet-5-5";'
    );
    claude = claude.replace(
      'if (/^claude-(?:opus-5(?:-5)?|opus-4-[78]|sonnet-5|fable-5(?:-1)?)$/.test(id)) {',
      'if (/^claude-(?:opus-5(?:-5)?|opus-4-[78]|sonnet-5(?:-5)?|fable-5(?:-1)?)$/.test(id) || id === "sonnet") {'
    );
    const targetClaudeModels = `export const models = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "sonnet", label: "Claude Sonnet (Latest / PadrÃ£o da Conta)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
  { id: "claude-fable-5", label: "Claude Fable 5" },
  { id: "claude-mythos-5", label: "Claude Mythos 5" },
];`;
    claude = claude.replace(/export const models = \[[^\]]*\];/s, targetClaudeModels);
    fs.writeFileSync(claudePath, claude, 'utf-8');
    console.log('[patch] claude-local src patched');
  }
} catch (e) {
  console.error('[patch] Error claude-local:', e.message);
}

// 2. SHARED AI-CONNECTIONS (Runtime compatibility for both src and dist)
try {
  const sharedFiles = [
    '/app/packages/shared/dist/ai-connections.js',
    '/app/packages/shared/src/ai-connections.ts'
  ];
  for (const fp of sharedFiles) {
    if (fs.existsSync(fp)) {
      let s = fs.readFileSync(fp, 'utf-8');
      let changed = false;

      // 2a. isAiConnectionCompatible universal pass for antigravity_local and opencode_local
      if (!s.includes('adapterType === "antigravity_local"') || !s.includes('adapterType === "opencode_local"')) {
        const targetTs = 'export function isAiConnectionCompatible(\n  requirement: AiConnectionMetadata | AiConnectionBinding,\n  adapterType: string,\n  model?: unknown,\n  runnerProvider?: unknown,\n  acpxAgent?: unknown,\n): boolean {';
        const replacementTs = 'export function isAiConnectionCompatible(\n  requirement: AiConnectionMetadata | AiConnectionBinding,\n  adapterType: string,\n  model?: unknown,\n  runnerProvider?: unknown,\n  acpxAgent?: unknown,\n): boolean {\n  if (adapterType === "antigravity_local" || adapterType === "opencode_local") return true;\n  if (!requirement || typeof requirement !== "object" || !("provider" in requirement)) return true;';

        const targetJs = 'export function isAiConnectionCompatible(requirement, adapterType, model, runnerProvider, acpxAgent) {';
        const replacementJs = 'export function isAiConnectionCompatible(requirement, adapterType, model, runnerProvider, acpxAgent) {\n  if (adapterType === "antigravity_local" || adapterType === "opencode_local") return true;\n  if (!requirement || typeof requirement !== "object" || !("provider" in requirement)) return true;';

        if (s.includes(targetTs)) {
          s = s.replace(targetTs, replacementTs);
          changed = true;
        } else if (s.includes(targetJs)) {
          s = s.replace(targetJs, replacementJs);
          changed = true;
        } else if (s.includes('function isAiConnectionCompatible')) {
          s = s.replace(/(function isAiConnectionCompatible[^{]+{)/, '$1\n  if (adapterType === "antigravity_local" || adapterType === "opencode_local") return true;\n  if (!requirement || typeof requirement !== "object" || !("provider" in requirement)) return true;');
          changed = true;
        }
      }

      // 2b. Add antigravity_local to capabilities lists if not present
      if (!s.includes('"antigravity_local"') && s.includes('adapters: ["claude_local"]')) {
        s = s.replace('adapters: ["claude_local"]', 'adapters: ["claude_local", "antigravity_local"]');
        s = s.replace('adapters: ["codex_local"]', 'adapters: ["codex_local", "antigravity_local"]');
        s = s.replace('adapters: ["opencode_local"]', 'adapters: ["opencode_local", "antigravity_local"]');
        s = s.replace('adapters: ["grok_local"]', 'adapters: ["grok_local", "antigravity_local"]');
        changed = true;
      }

      // 2c. Relax openrouter model prefix requirement for opencode_local
      if (s.includes('requirement.provider !== "openrouter"') && !s.includes('adapterType === "opencode_local" ||')) {
        s = s.replace(
          'requirement.provider !== "openrouter" ||',
          'requirement.provider !== "openrouter" || adapterType === "opencode_local" ||'
        );
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(fp, s, 'utf-8');
        console.log(`[patch] ${fp} compatibility patched successfully`);
      }
    }
  }
} catch (e) {
  console.error('[patch] Error shared ai-connections:', e.message);
}

// 2d. SHARED AGENT VALIDATORS (Allow nullable aiConnection for free mode and antigravity)
try {
  const validatorFiles = [
    '/app/packages/shared/dist/validators/agent.js',
    '/app/packages/shared/src/validators/agent.ts'
  ];
  for (const fp of validatorFiles) {
    if (fs.existsSync(fp)) {
      let v = fs.readFileSync(fp, 'utf-8');
      let changed = false;

      // agentRuntimeConfigSchema & testAdapterEnvironmentSchema: allow aiConnection to be null
      if (v.includes('aiConnection: aiConnectionBindingSchema.optional(),')) {
        v = v.replaceAll(
          'aiConnection: aiConnectionBindingSchema.optional(),',
          'aiConnection: aiConnectionBindingSchema.optional().nullable(),'
        );
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(fp, v, 'utf-8');
        console.log(`[patch] ${fp} patched for nullable aiConnection`);
      }
    }
  }
} catch (e) {
  console.error('[patch] Error shared agent validators:', e.message);
}

// 3. SERVER ROUTES AGENTS (Runtime routes: agents.ts & agents.js)
try {
  const agentRouteFiles = [
    '/app/server/dist/routes/agents.js',
    '/app/server/src/routes/agents.ts'
  ];
  for (const fp of agentRouteFiles) {
    if (fs.existsSync(fp)) {
      let a = fs.readFileSync(fp, 'utf-8');
      let changed = false;

      // 3a. Update Agent route: strip aiConnection when saving antigravity_local or when explicitly set to null/empty
      const targetPattern = /if\s*\(existing\.runtimeConfig\.aiConnection\s*&&\s*requestedRuntimeConfig\s*&&\s*!requestedRuntimeConfig\.aiConnection\)\s*requestedRuntimeConfig\.aiConnection\s*=\s*existing\.runtimeConfig\.aiConnection;/;
      
      const newCode = `if (requestedAdapterType === "antigravity_local") {
            if (requestedRuntimeConfig) delete requestedRuntimeConfig.aiConnection;
            if (existing.runtimeConfig) delete existing.runtimeConfig.aiConnection;
            if (patchData.runtimeConfig) delete patchData.runtimeConfig.aiConnection;
        } else if (requestedRuntimeConfig && (requestedRuntimeConfig.aiConnection === null || requestedRuntimeConfig.aiConnection === false || requestedRuntimeConfig.clearAiConnection === true)) {
            delete requestedRuntimeConfig.aiConnection;
            if (existing.runtimeConfig) delete existing.runtimeConfig.aiConnection;
            if (patchData.runtimeConfig) delete patchData.runtimeConfig.aiConnection;
        } else if (requestedAdapterType && requestedAdapterType !== existing.adapterType) {
            const existingConn = requestedRuntimeConfig?.aiConnection ?? existing.runtimeConfig?.aiConnection;
            if (existingConn && !isAiConnectionCompatible(existingConn, requestedAdapterType)) {
                if (requestedRuntimeConfig) delete requestedRuntimeConfig.aiConnection;
                if (existing.runtimeConfig) delete existing.runtimeConfig.aiConnection;
                if (patchData.runtimeConfig) delete patchData.runtimeConfig.aiConnection;
            } else if (existing.runtimeConfig.aiConnection && requestedRuntimeConfig && !requestedRuntimeConfig.aiConnection) {
                requestedRuntimeConfig.aiConnection = existing.runtimeConfig.aiConnection;
            }
        } else if (existing.runtimeConfig.aiConnection && requestedRuntimeConfig && !requestedRuntimeConfig.aiConnection) {
            requestedRuntimeConfig.aiConnection = existing.runtimeConfig.aiConnection;
        }`;

      if (targetPattern.test(a)) {
        a = a.replace(targetPattern, newCode);
        changed = true;
      }

      // 3b. Don't throw incompatible harness error for antigravity_local or opencode_local
      if (a.includes('throw unprocessable("Select an AI connection compatible with the new harness and model");') &&
          !a.includes('requestedAdapterType !== "antigravity_local" && requestedAdapterType !== "opencode_local"')) {
        a = a.replace(
          'if (nextAiBinding.mode !== "router" && !isAiConnectionCompatible(nextAiBinding, requestedAdapterType, aiConfig.model, aiConfig.provider, aiConfig.acpxAgent)) throw unprocessable("Select an AI connection compatible with the new harness and model");',
          'if (nextAiBinding.mode !== "router" && requestedAdapterType !== "antigravity_local" && requestedAdapterType !== "opencode_local" && !isAiConnectionCompatible(nextAiBinding, requestedAdapterType, aiConfig.model, aiConfig.provider, aiConfig.acpxAgent)) throw unprocessable("Select an AI connection compatible with the new harness and model");'
        );
        a = a.replace(
          'if (nextAiBinding.mode !== "router" && !isAiConnectionCompatible(nextAiBinding, requestedAdapterType, aiConfig.model, aiConfig.provider, aiConfig.acpxAgent))\n                throw unprocessable("Select an AI connection compatible with the new harness and model");',
          'if (nextAiBinding.mode !== "router" && requestedAdapterType !== "antigravity_local" && requestedAdapterType !== "opencode_local" && !isAiConnectionCompatible(nextAiBinding, requestedAdapterType, aiConfig.model, aiConfig.provider, aiConfig.acpxAgent))\n                throw unprocessable("Select an AI connection compatible with the new harness and model");'
        );
        changed = true;
      }

      // 3c. Test-Environment route: ignore aiBinding for antigravity_local
      if (a.includes('const aiBinding = requestedBinding?.mode === "router" ? undefined : requestedBinding;') &&
          !a.includes('type === "antigravity_local"')) {
        a = a.replace(
          'const aiBinding = requestedBinding?.mode === "router" ? undefined : requestedBinding;',
          'const aiBinding = (type === "antigravity_local") ? undefined : (requestedBinding?.mode === "router" ? undefined : requestedBinding);'
        );
        changed = true;
      } else if (a.includes('const aiBinding = req.body.aiConnection ? aiConnectionBindingSchema.parse(req.body.aiConnection) : undefined;') &&
                 !a.includes('type === "antigravity_local"')) {
        a = a.replace(
          'const aiBinding = req.body.aiConnection ? aiConnectionBindingSchema.parse(req.body.aiConnection) : undefined;',
          'const aiBinding = (type === "antigravity_local") ? undefined : (req.body.aiConnection ? aiConnectionBindingSchema.parse(req.body.aiConnection) : undefined);'
        );
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(fp, a, 'utf-8');
        console.log(`[patch] ${fp} patched for flexible harness and connection switching`);
      }
    }
  }
} catch (e) {
  console.error('[patch] Error server agents route:', e.message);
}

// 3d. UI CONNECTION PICKER & FREE MODE SUPPORT
try {
  const { execSync } = require('child_process');

  // 3d.1 Patch AiConnectionPicker.tsx
  const pickerPath = '/app/ui/src/components/ai-connections/AiConnectionPicker.tsx';
  if (fs.existsSync(pickerPath)) {
    let picker = fs.readFileSync(pickerPath, 'utf-8');
    let pickerChanged = false;
    if (!picker.includes('id: "none"')) {
      picker = picker.replace(
        /selectedId=\{[^}]+\}/,
        'selectedId={!value ? "none" : value?.mode === "responsible_user" ? "responsible_user" : value?.connectionId}'
      );
      picker = picker.replace(
        'choices={[\n              { id: "responsible_user",',
        'choices={[\n              { id: "none", name: "Sem conexao gerenciada (Modo gratuito / Chave de ambiente)", description: <>\n                <span className="block">Executa o agente sem conta gerenciada do Paperclip (usa modelos gratuitos ou variaveis de ambiente locais).</span>\n              </> },\n              { id: "responsible_user",'
      );
      picker = picker.replace(
        'onSelect={(id) => {\n              if (id === "responsible_user")',
        'onSelect={(id) => {\n              if (id === "none") onChange(null as unknown as AiConnectionBinding);\n              else if (id === "responsible_user")'
      );
      pickerChanged = true;
      console.log('[patch] AiConnectionPicker.tsx patched with free-mode option');
    }
    if (pickerChanged) {
      fs.writeFileSync(pickerPath, picker, 'utf-8');
      uiModified = true;
    }
  }

  // 3d.2 Patch AiConnectionField.tsx
  const fieldPath = '/app/ui/src/components/ai-connections/AiConnectionField.tsx';
  if (fs.existsSync(fieldPath)) {
    let field = fs.readFileSync(fieldPath, 'utf-8');
    let fieldChanged = false;
    if (!field.includes('if (!binding) onChange(null as any)')) {
      const oldOnChange = 'onChange={(binding) =>\n          changeBinding(aiConnectionBindingSchema.parse(binding))\n        }';
      const newOnChange = 'onChange={(binding) => {\n          if (!binding) onChange(null as any);\n          else changeBinding(aiConnectionBindingSchema.parse(binding));\n        }}';
      if (field.includes(oldOnChange)) {
        field = field.replace(oldOnChange, newOnChange);
        fieldChanged = true;
      } else if (field.includes('changeBinding(aiConnectionBindingSchema.parse(binding))')) {
        field = field.replace(
          'changeBinding(aiConnectionBindingSchema.parse(binding))',
          'if (!binding) onChange(null as any); else changeBinding(aiConnectionBindingSchema.parse(binding));'
        );
        fieldChanged = true;
      }
    }
    if (field.includes('if (legacy && !value && !adopting)') && !field.includes('value !== null')) {
      field = field.replace(
        'if (legacy && !value && !adopting)',
        'if (legacy && !value && !adopting && value !== null)'
      );
      fieldChanged = true;
    }
    if (fieldChanged) {
      fs.writeFileSync(fieldPath, field, 'utf-8');
      uiModified = true;
      console.log('[patch] AiConnectionField.tsx patched to allow null free-mode binding');
    }
  }

  // 3d.3 Patch AgentConfigForm.tsx
  const agentFormPath = '/app/ui/src/components/AgentConfigForm.tsx';
  if (fs.existsSync(agentFormPath)) {
    let form = fs.readFileSync(agentFormPath, 'utf-8');
    let formChanged = false;

    // Remove any erroneous t === "antigravity_local" inside function mark(...)
    const brokenMarkLine = '                      ...(t === "antigravity_local" ? { runtime: { ...prev.runtime, runtimeConfig: { ...(prev.runtime?.runtimeConfig as Record<string, unknown> | undefined), aiConnection: null } } } : {}),\n';
    if (form.includes(brokenMarkLine)) {
      form = form.replace(brokenMarkLine, '');
      formChanged = true;
      console.log('[patch] AgentConfigForm.tsx cleaned up broken mark() reference to t');
    }

    // In adapter onChange branch, cleanly inject antigravity_local handling
    const targetBranch = 'setOverlay((prev) => ({\n                      ...prev,\n                      adapterType: t,\n                      adapterConfig: {';
    const cleanBranch = `setOverlay((prev) => ({
                      ...prev,
                      adapterType: t,
                      ...(t === "antigravity_local"
                        ? {
                            runtime: {
                              ...prev.runtime,
                              runtimeConfig: {
                                ...((prev.runtime?.runtimeConfig as Record<string, unknown> | undefined) ?? {}),
                                aiConnection: null,
                              },
                            },
                          }
                        : {}),
                      adapterConfig: {`;
    if (form.includes(targetBranch) && !form.includes('runtimeConfig: { ...((prev.runtime?.runtimeConfig')) {
      form = form.replace(targetBranch, cleanBranch);
      formChanged = true;
      console.log('[patch] AgentConfigForm.tsx adapter onChange patched for antigravity_local');
    }

    // Default model to gemini-3.8-flash for antigravity_local
    if (form.includes('t === "cursor"') && !form.includes('t === "antigravity_local"')) {
      form = form.replace(
        't === "cursor"\n                              ? DEFAULT_CURSOR_LOCAL_MODEL\n                            : t === "paperclip_runner"',
        't === "cursor"\n                              ? DEFAULT_CURSOR_LOCAL_MODEL\n                            : t === "antigravity_local"\n                              ? "gemini-3.8-flash"\n                            : t === "paperclip_runner"'
      );
      formChanged = true;
    }

    // Remove legacy prop from AiConnectionField so it does not block free mode
    if (form.includes('environmentId={currentDefaultEnvironmentId || undefined} legacy')) {
      form = form.replace(
        'environmentId={currentDefaultEnvironmentId || undefined} legacy',
        'environmentId={currentDefaultEnvironmentId || undefined}'
      );
      formChanged = true;
      console.log('[patch] AgentConfigForm.tsx removed legacy prop from AiConnectionField');
    }

    // Preserve null aiConnection binding in AiConnectionField so free mode can be selected cleanly
    const targetAiConnVal = 'value={aiRuntimeConnectionBindingSchema.safeParse((overlay.runtime.runtimeConfig as Record<string, unknown> | undefined)?.aiConnection ?? runtimeConfig.aiConnection).data}';
    const cleanAiConnVal = 'value={((overlay.runtime.runtimeConfig as Record<string, unknown> | undefined)?.aiConnection !== undefined ? (overlay.runtime.runtimeConfig as Record<string, unknown> | undefined)?.aiConnection : runtimeConfig.aiConnection) ? aiRuntimeConnectionBindingSchema.safeParse((overlay.runtime.runtimeConfig as Record<string, unknown> | undefined)?.aiConnection !== undefined ? (overlay.runtime.runtimeConfig as Record<string, unknown> | undefined)?.aiConnection : runtimeConfig.aiConnection).data : undefined}';
    if (form.includes(targetAiConnVal)) {
      form = form.replace(targetAiConnVal, cleanAiConnVal);
      formChanged = true;
      console.log('[patch] AgentConfigForm.tsx patched AiConnectionField value prop for null preservation');
    }

    if (formChanged) {
      fs.writeFileSync(agentFormPath, form, 'utf-8');
      uiModified = true;
    }
  }

  if (uiModified) {
    console.log('[patch] Rebuilding Paperclip UI with Vite...');
    execSync('pnpm --filter ui run build', { cwd: '/app', stdio: 'inherit' });
    console.log('[patch] Paperclip UI built successfully.');
  }
} catch (e) {
  console.error('[patch] Error updating UI components:', e.message);
}

// 3c. SERVER AI CONNECTIONS PERMISSION UNLOCK (Allow company AI connections for all agents)
try {
  const aiConnDist = '/app/server/dist/services/ai-connections.js';
  if (fs.existsSync(aiConnDist)) {
    let code = fs.readFileSync(aiConnDist, 'utf-8');
    if (!code.includes('/* auto-install unlocked */')) {
      const targetStr = 'if (!installs.length &&\n            !((input.allowUninstalledPersonal &&\n                grant.kind === "user" && grant.subjectUserId === userId) ||\n                (input.allowUninstalledShared && binding.mode === "shared" && grant.kind === "organization")))\n            throw forbidden("This connection is not permitted for this agent");';
      const replacementStr = '/* auto-install unlocked */\n        if (!installs.length &&\n            !((input.allowUninstalledPersonal &&\n                grant.kind === "user" && grant.subjectUserId === userId) ||\n                (input.allowUninstalledShared && binding.mode === "shared" && grant.kind === "organization"))) {\n            if (connection.companyId !== companyId) {\n                throw forbidden("This connection is not permitted for this agent");\n            }\n        }';
      if (code.includes(targetStr)) {
        code = code.replace(targetStr, replacementStr);
        fs.writeFileSync(aiConnDist, code, 'utf-8');
        console.log('[patch] server/dist/services/ai-connections.js auto-install permission unlocked');
      }
    }
  }

  const aiConnSrc = '/app/server/src/services/ai-connections.ts';
  if (fs.existsSync(aiConnSrc)) {
    let src = fs.readFileSync(aiConnSrc, 'utf-8');
    if (!src.includes('/* auto-install unlocked */')) {
      const targetSrc = 'if (\n      !installs.length &&\n      !(\n        (input.allowUninstalledPersonal &&\n          grant.kind === "user" && grant.subjectUserId === userId) ||\n        (input.allowUninstalledShared && binding.mode === "shared" && grant.kind === "organization")\n      )\n    )\n      throw forbidden("This connection is not permitted for this agent");';
      const replacementSrc = '/* auto-install unlocked */\n    if (\n      !installs.length &&\n      !(\n        (input.allowUninstalledPersonal &&\n          grant.kind === "user" && grant.subjectUserId === userId) ||\n        (input.allowUninstalledShared && binding.mode === "shared" && grant.kind === "organization")\n      )\n    ) {\n      if (connection.companyId !== companyId) {\n        throw forbidden("This connection is not permitted for this agent");\n      }\n    }';
      if (src.includes(targetSrc)) {
        src = src.replace(targetSrc, replacementSrc);
        fs.writeFileSync(aiConnSrc, src, 'utf-8');
        console.log('[patch] server/src/services/ai-connections.ts auto-install permission unlocked');
      }
    }
  }
} catch (e) {
  console.error('[patch] Error ai-connections permissions unlock:', e.message);
}

// 4. ENSURE AGY SYMLINK IN PATH
try {
  const { execSync } = require('child_process');
  if (fs.existsSync('/paperclip/.local/bin/agy')) {
    try {
      execSync('ln -sf /paperclip/.local/bin/agy /usr/local/bin/agy && chmod +x /usr/local/bin/agy');
      console.log('[patch] agy symlink verified at /usr/local/bin/agy');
    } catch {}
  }
} catch (e) {}

// 5. ENSURE PERSISTENT GEMINI CONFIG DIRECTORY
try {
  const { execSync } = require('child_process');
  try {
    execSync('mkdir -p /paperclip/.gemini && ln -sfn /paperclip/.gemini /root/.gemini');
    console.log('[patch] persistent /root/.gemini linked to /paperclip/.gemini');
  } catch {}
} catch (e) {}

// 6. FIX ANTIGRAVITY TIMEOUT DEFAULT
try {
  const distExec = '/paperclip/adapters/antigravity-local/dist/server/execute.js';
  if (fs.existsSync(distExec)) {
    let code = fs.readFileSync(distExec, 'utf-8');
    if (code.includes('const timeoutSec = Math.max(30, asNumber(config.timeoutSec, 600));')) {
      code = code.replace('const timeoutSec = Math.max(30, asNumber(config.timeoutSec, 600));', 'const rawTimeout = asNumber(config.timeoutSec, 0); const timeoutSec = rawTimeout > 0 ? Math.max(30, rawTimeout) : 0;');
      fs.writeFileSync(distExec, code, 'utf-8');
      console.log('[patch] antigravity-local timeout: zero wall-clock timeout policy (unlimited when 0)');
    }
  }
} catch (e) { console.error('[patch] Error timeout:', e.message); }

// 7. FIX ANTIGRAVITY RESPONSE PARSER (Expose response to Paperclip UI)
try {
  const parseP = '/paperclip/adapters/antigravity-local/dist/server/parse.js';
  if (fs.existsSync(parseP)) {
    let code = fs.readFileSync(parseP, 'utf-8');
    if (!code.includes('event.result.response')) {
      code = code.replace(
        'if (typeof event.summary === "string" && event.summary.trim()) {',
        'if (event.result && typeof event.result.response === "string" && event.result.response.trim()) { messages.push(event.result.response.trim()); }\n            if (typeof event.summary === "string" && event.summary.trim()) {'
      );
      fs.writeFileSync(parseP, code, 'utf-8');
      console.log('[patch] antigravity parse.js response parser patched');
    }
  }
  const execP = '/paperclip/adapters/antigravity-local/dist/server/execute.js';
  if (fs.existsSync(execP)) {
    let code = fs.readFileSync(execP, 'utf-8');
    if (!code.includes('r.summary = s')) {
      code = code.replace(
        'summary: parsed.summary,',
        'summary: parsed.summary || (parsed.resultJson?.result?.response ? String(parsed.resultJson.result.response) : null),'
      );
      code = code.replace(
        'resultJson: parsed.resultJson ?? {',
        'resultJson: (() => { const r = parsed.resultJson ?? { stdout: attemptProc.stdout, stderr: attemptProc.stderr }; const s = parsed.summary || (r?.result?.response ? String(r.result.response) : null); if (s && !r.summary) r.summary = s; return r; })(),' + '\n            _unused: {'
      );
      fs.writeFileSync(execP, code, 'utf-8');
      console.log('[patch] antigravity execute.js resultJson.summary patched');
    }
  }
} catch (e) { console.error('[patch] Error parser:', e.message); }

// 8. UI PARSER STEP_UPDATE PATCH (Antigravity real-time tools)
try {
  const pkgP = '/paperclip/adapters/antigravity-local/package.json';
  if (fs.existsSync(pkgP)) {
    const p = JSON.parse(fs.readFileSync(pkgP, 'utf-8'));
    if (p.exports && p.exports['./ui-parser'] !== './dist/ui-parser.js') {
      p.exports['./ui-parser'] = './dist/ui-parser.js';
      fs.writeFileSync(pkgP, JSON.stringify(p, null, 2), 'utf-8');
      console.log('[patch] antigravity package.json ui-parser export updated to dist');
    }
  }
  const distP = '/paperclip/adapters/antigravity-local/dist/ui-parser.js';
  if (fs.existsSync('/paperclip/ui-parser.backup.js')) {
    fs.copyFileSync('/paperclip/ui-parser.backup.js', distP);
    console.log('[patch] antigravity ui-parser.js restored from backup');
  }
} catch (e) { console.error('[patch] Error updating package.json ui-parser:', e.message); }

// 9. REAL-TIME TOOL PROGRESS IN STATUS BANNER (wrappedOnLog)
try {
  const execDist = '/paperclip/adapters/antigravity-local/dist/server/execute.js';
  if (fs.existsSync(execDist)) {
    let code = fs.readFileSync(execDist, 'utf-8');
    if (!code.includes('wrappedOnLog')) {
      code = code.replace(
        'const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;',
        'const { runId, agent, runtime, config, context, onLog, onMeta, onEvent, onRuntimeProgress, authToken } = ctx;'
      );
      const oldRunAttempt = `    const runAttempt = async (attemptConvId) => {
        const args = buildArgs(attemptConvId);
        return runAdapterExecutionTargetProcess(runId, executionTarget, command, args, {
            cwd: effectiveExecutionCwd,
            env: runtimeEnv,
            timeoutSec,
            graceSec,
            onLog,
        });
    };`;
      const newRunAttempt = `    const runAttempt = async (attemptConvId) => {
        const args = buildArgs(attemptConvId);
        let lineBuffer = "";
        const wrappedOnLog = async (stream, chunk) => {
            await onLog(stream, chunk);
            if (stream === "stdout" && (onRuntimeProgress || onEvent)) {
                lineBuffer += chunk;
                const lines = lineBuffer.split(/\\r?\\n/);
                lineBuffer = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;
                    try {
                        const ev = JSON.parse(trimmed);
                        if (ev.event === "step_update" && ev.step_update) {
                            const su = ev.step_update;
                            if (su.step_type === "tool") {
                                if (su.state === "ACTIVE") {
                                    const toolName = String(su.tool_name || su.tool_info?.name || "tool");
                                    if (onRuntimeProgress) {
                                        await onRuntimeProgress({
                                            phase: "run_activity",
                                            message: \`Using \${toolName}\`,
                                            currentToolName: toolName,
                                            lastEventAt: new Date(),
                                        });
                                    }
                                    if (onEvent) {
                                        await onEvent({
                                            eventType: "tool_use",
                                            stream: "stdout",
                                            message: \`Using \${toolName}\`,
                                            payload: {
                                                toolName,
                                                toolCall: { name: toolName, input: su.tool_info?.parameters || {} }
                                            }
                                        });
                                    }
                                } else if (su.state === "DONE") {
                                    if (onRuntimeProgress) {
                                        await onRuntimeProgress({
                                            phase: "run_activity",
                                            message: "Finished tool",
                                            currentToolName: null,
                                            lastEventAt: new Date(),
                                        });
                                    }
                                }
                            } else if (su.step_type === "agent_response") {
                                if (typeof su.thinking === "string" && su.thinking.trim()) {
                                    if (onRuntimeProgress) {
                                        await onRuntimeProgress({
                                            phase: "run_activity",
                                            message: "Thinking...",
                                            currentToolName: null,
                                            lastAssistantSnippet: su.thinking.slice(0, 100),
                                            lastEventAt: new Date(),
                                        });
                                    }
                                }
                            }
                        }
                    } catch {}
                }
            }
        };
        return runAdapterExecutionTargetProcess(runId, executionTarget, command, args, {
            cwd: effectiveExecutionCwd,
            env: runtimeEnv,
            timeoutSec,
            graceSec,
            onLog: wrappedOnLog,
        });
    };`;
      code = code.replace(oldRunAttempt, newRunAttempt);
      fs.writeFileSync(execDist, code, 'utf-8');
      console.log('[patch] antigravity execute.js patched with wrappedOnLog');
    }
  }
} catch (e) { console.error('[patch] Error updating execute.js:', e.message); }

// 10. CONVERSATION ADAPTER TYPES (Enable antigravity_local chat turn continuation)
try {
  const convFiles = [
    '/app/server/dist/services/conversation-continuation.js',
    '/app/server/src/services/conversation-continuation.ts'
  ];
  for (const fp of convFiles) {
    if (fs.existsSync(fp)) {
      let content = fs.readFileSync(fp, 'utf-8');
      if (!content.includes('antigravity_local')) {
        content = content.replace(
          'export const CONVERSATION_ADAPTER_TYPES = [',
          'export const CONVERSATION_ADAPTER_TYPES = [\n    "antigravity_local",'
        );
        fs.writeFileSync(fp, content, 'utf-8');
        console.log('[patch] conversation-continuation patched with antigravity_local in ' + fp);
      }
    }
  }
} catch (e) { console.error('[patch] Error conversation-continuation:', e.message); }

// 11. EXPLICIT CONTINUATION (Allow legacy runs to continue without missing process identity)
try {
  const encFiles = [
    '/app/server/dist/services/explicit-native-continuation.js',
    '/app/server/src/services/explicit-native-continuation.ts'
  ];
  for (const fp of encFiles) {
    if (fs.existsSync(fp)) {
      let content = fs.readFileSync(fp, 'utf-8');
      if (content.includes('!await hasHistoricalSuspendedNativeSession(db, run))') && !content.includes('run.runtimeMode !== "legacy"')) {
        content = content.replace(
          '!await hasHistoricalSuspendedNativeSession(db, run))\n                    return blocked("process_identity_missing", "The previous run has no verified stop record. Paperclip cannot start this message yet.");',
          '!await hasHistoricalSuspendedNativeSession(db, run) && run.runtimeMode !== "legacy")\n                    return blocked("process_identity_missing", "The previous run has no verified stop record. Paperclip cannot start this message yet.");'
        );
        content = content.replace(
          '!await hasHistoricalSuspendedNativeSession(db, run)) return blocked("process_identity_missing", "The previous run has no verified stop record. Paperclip cannot start this message yet.");',
          '!await hasHistoricalSuspendedNativeSession(db, run) && run.runtimeMode !== "legacy") return blocked("process_identity_missing", "The previous run has no verified stop record. Paperclip cannot start this message yet.");'
        );
        fs.writeFileSync(fp, content, 'utf-8');
        console.log('[patch] explicit-native-continuation patched in ' + fp);
      }
    }
  }
} catch (e) { console.error('[patch] Error explicit-continuation:', e.message); }


// 12. NATIVE FRONTEND UI ADAPTER & STATEFUL PARSER (Antigravity and OpenCode)
try {
  const path = require('path');
  const indexHtmlPath = '/app/ui/dist/index.html';
  const assetsDir = '/app/ui/dist/assets';

  let baseSrc = null;
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const candidate = files.find(f => f.startsWith('index-') && f.endsWith('.js') && !f.includes('enhanced') && !f.includes('v3'));
    if (candidate) {
      baseSrc = path.join(assetsDir, candidate);
    }
  }

  if (baseSrc && fs.existsSync(baseSrc)) {
    const baseName = path.basename(baseSrc);
    const enhancedName = baseName.replace('index-', 'index-enhanced-');
    const bundlePath = path.join(assetsDir, enhancedName);

    if (uiModified || !fs.existsSync(bundlePath)) {
      let code = fs.readFileSync(baseSrc, 'utf8');

      const parserCode = `
function parseAntigravityLine(line,ts){
  var trimmed=line.trim();
  if(!trimmed)return[];
  if(!trimmed.startsWith('{')||!trimmed.endsWith('}')){
    if(trimmed.startsWith('[paperclip]')||trimmed.startsWith('[system]'))return[{kind:'system',ts:ts,text:trimmed}];
    return[{kind:'stdout',ts:ts,text:line}];
  }
  try{
    var parsed=JSON.parse(trimmed);
    if(!parsed||typeof parsed!=='object')return[{kind:'stdout',ts:ts,text:line}];
    if(parsed.event==='step_update'&&parsed.step_update){
      var su=parsed.step_update;
      var stepIdx=su.step_index!==undefined?su.step_index:'unknown';
      var toolId='step_'+stepIdx;
      if(su.step_type==='tool'){
        if(su.state==='ACTIVE'){
          var name=String(su.tool_name||(su.tool_info&&su.tool_info.name)||'tool');
          var input=(su.tool_info&&(su.tool_info.parameters||su.tool_info.args))||{};
          if(typeof input!=='object'||input===null)input={value:input};
          if(input.CommandLine&&!input.command)input.command=input.CommandLine;
          return[{kind:'tool_call',ts:ts,name:name,input:input,toolUseId:toolId}];
        }
        if(su.state==='DONE'){
          var rawOut=(su.tool_info&&(su.tool_info.output!==undefined?su.tool_info.output:su.tool_info.result))||'';
          var content=typeof rawOut==='string'?rawOut:JSON.stringify(rawOut,null,2);
          var isError=su.tool_info&&su.tool_info.exitCode!==undefined&&su.tool_info.exitCode!==0;
          return[{kind:'tool_result',ts:ts,toolUseId:toolId,content:content,isError:Boolean(isError)}];
        }
      }
      if(su.step_type==='agent_response'){
        var entries=[];
        if(typeof su.thinking_delta==='string'&&su.thinking_delta){
          entries.push({kind:'thinking',ts:ts,text:su.thinking_delta,delta:true});
        }else if(typeof su.thinking==='string'&&su.thinking.trim()){
          entries.push({kind:'thinking',ts:ts,text:su.thinking.trim()});
        }
        if(typeof su.text_delta==='string'&&su.text_delta){
          entries.push({kind:'assistant',ts:ts,text:su.text_delta,delta:true});
        }else if(typeof su.content==='string'&&su.content.trim()){
          entries.push({kind:'assistant',ts:ts,text:su.content.trim()});
        }
        if(su.state==='DONE'&&su.usage){
          entries.push({kind:'result',ts:ts,text:'Response completed',inputTokens:typeof su.usage.input_tokens==='number'?su.usage.input_tokens:0,outputTokens:typeof su.usage.output_tokens==='number'?su.usage.output_tokens:0,cachedTokens:0,costUsd:0,subtype:'completed',isError:false,errors:[]});
        }
        if(entries.length>0)return entries;
        return[];
      }
      if(su.step_type==='user_input'){
        if(su.content)return[{kind:'user',ts:ts,text:String(su.content)}];
        return[];
      }
    }
    if(parsed.event==='init'||parsed.type==='init'){
      var convId=parsed.conversation_id||parsed.conversationId||'antigravity-session';
      return[{kind:'init',ts:ts,model:'antigravity',sessionId:String(convId)}];
    }
    if(Array.isArray(parsed.tool_calls)&&parsed.tool_calls.length>0){
      return parsed.tool_calls.map(function(tc,idx){
        var inp=tc.args||tc.input||{};
        if(inp.CommandLine&&!inp.command)inp.command=inp.CommandLine;
        return{kind:'tool_call',ts:ts,name:String(tc.name||'tool'),input:inp,toolUseId:String(tc.id||('agy-tool-'+idx))};
      });
    }
    if(parsed.event==='tool_call'||parsed.type==='tool_call'){
      var inp2=parsed.input||parsed.args||{};
      if(inp2.CommandLine&&!inp2.command)inp2.command=inp2.CommandLine;
      return[{kind:'tool_call',ts:ts,name:String(parsed.name||parsed.tool||'tool'),input:inp2,toolUseId:String(parsed.id||parsed.tool_use_id||'agy-tool-1')}];
    }
    if(parsed.event==='tool_result'||parsed.type==='tool_result'){
      return[{kind:'tool_result',ts:ts,toolUseId:String(parsed.tool_use_id||parsed.id||'agy-tool-1'),content:typeof parsed.content==='string'?parsed.content:JSON.stringify(parsed.content||''),isError:Boolean(parsed.is_error)}];
    }
    if(parsed.thinking)return[{kind:'thinking',ts:ts,text:String(parsed.thinking)}];
    if(parsed.content||parsed.text)return[{kind:'assistant',ts:ts,text:String(parsed.content||parsed.text)}];
    return[{kind:'stdout',ts:ts,text:line}];
  }catch(e){
    return[{kind:'stdout',ts:ts,text:line}];
  }
}
var antigravityLocalUIAdapter={type:'antigravity_local',label:'Google Antigravity',parseStdoutLine:parseAntigravityLine};
`;

      const opencodeParserCode = `
function createOpenCodeStdoutParser(){
  var pendingTexts = [];
  return {
    parseLine: function(line, ts) {
      try {
        var parsed = JSON.parse(line.trim());
        if (!parsed || typeof parsed !== 'object') return [{ kind: 'stdout', ts: ts, text: line }];
        var type = String(parsed.type || '');
        if (type === 'text') {
          var part = parsed.part || {};
          var text = String(part.text || '').trim();
          if (!text) return [];
          pendingTexts.push({ ts: ts, text: text });
          return [];
        }
        if (type === 'reasoning') {
          var part2 = parsed.part || {};
          var text2 = String(part2.text || '').trim();
          if (!text2) return [];
          return [{ kind: 'thinking', ts: ts, text: text2 }];
        }
        if (type === 'tool_use') {
          var flushed = [];
          if (pendingTexts.length > 0) {
            for (var i = 0; i < pendingTexts.length; i++) {
              flushed.push({ kind: 'thinking', ts: pendingTexts[i].ts, text: pendingTexts[i].text });
            }
            pendingTexts = [];
          }
          var toolEntries = typeof BWe === 'function' ? BWe(parsed, ts) : [{ kind: 'stdout', ts: ts, text: line }];
          return flushed.concat(toolEntries);
        }
        if (type === 'step_start') {
          var sId = String(parsed.sessionID || '');
          return [{ kind: 'system', ts: ts, text: 'step started' + (sId ? ' (' + sId + ')' : '') }];
        }
        if (type === 'step_finish') {
          var part3 = parsed.part || {};
          var reason = String(part3.reason || 'step').toLowerCase();
          var flushed2 = [];
          if (pendingTexts.length > 0) {
            var isFinal = reason === 'stop' || reason === 'end_turn' || reason === 'done';
            for (var j = 0; j < pendingTexts.length; j++) {
              var itemText = pendingTexts[j].text;
              if (isFinal) {
                var cleanMatch = itemText.match(/^(.*?)(?=\\n*##\\s+(?:Objective|Important Details|Work State|Next Best Steps|Next Move|Relevant Files)\\b)/s);
                if (cleanMatch && cleanMatch[1].trim()) {
                  flushed2.push({ kind: 'assistant', ts: pendingTexts[j].ts, text: cleanMatch[1].trim() });
                  var scratchpad = itemText.slice(cleanMatch[1].length).trim();
                  if (scratchpad) flushed2.push({ kind: 'thinking', ts: pendingTexts[j].ts, text: scratchpad });
                } else if (/^##\\s+(?:Objective|Important Details|Work State|Next Best Steps|Next Move|Relevant Files)\\b/i.test(itemText)) {
                  flushed2.push({ kind: 'thinking', ts: pendingTexts[j].ts, text: itemText });
                } else {
                  flushed2.push({ kind: 'assistant', ts: pendingTexts[j].ts, text: itemText });
                }
              } else {
                flushed2.push({ kind: 'thinking', ts: pendingTexts[j].ts, text: itemText });
              }
            }
            pendingTexts = [];
          }
          var tokens = part3.tokens || {};
          var cache = tokens.cache || {};
          var outTok = (tokens.output || 0) + (tokens.reasoning || 0);
          flushed2.push({
            kind: 'result',
            ts: ts,
            text: reason,
            inputTokens: tokens.input || 0,
            outputTokens: outTok,
            cachedTokens: cache.read || 0,
            costUsd: part3.cost || 0,
            subtype: reason,
            isError: false,
            errors: []
          });
          return flushed2;
        }
        if (type === 'error') {
          var flushed3 = [];
          if (pendingTexts.length > 0) {
            for (var k = 0; k < pendingTexts.length; k++) {
              flushed3.push({ kind: 'assistant', ts: pendingTexts[k].ts, text: pendingTexts[k].text });
            }
            pendingTexts = [];
          }
          var errTxt = (typeof FWe === 'function' ? FWe(parsed.error || parsed.message) : null) || line;
          flushed3.push({ kind: 'stderr', ts: ts, text: errTxt });
          return flushed3;
        }
        return [{ kind: 'stdout', ts: ts, text: line }];
      } catch (err) {
        return [{ kind: 'stdout', ts: ts, text: line }];
      }
    },
    reset: function() { pendingTexts = []; }
  };
}
`;

      code = parserCode + '\n' + opencodeParserCode + '\n' + code;

      const targetRegisterMatch = code.match(/function\s+[A-Za-z0-9_$]+\(\)\{for\(const\s+[A-Za-z0-9_$]+\s+of\[/);
      if (targetRegisterMatch) {
        code = code.replace(targetRegisterMatch[0], targetRegisterMatch[0] + 'antigravityLocalUIAdapter,');
        console.log('[patch] registerBuiltInUIAdapters patched with antigravityLocalUIAdapter');
      }

      const targetOc = code.match(/type:"opencode_local",label:"OpenCode",parseStdoutLine:[A-Za-z0-9_$]+/);
      if (targetOc) {
        code = code.replace(targetOc[0], targetOc[0] + ',createStdoutParser:createOpenCodeStdoutParser');
        console.log('[patch] opencode_local patched with createStdoutParser');
      }

      fs.writeFileSync(bundlePath, code, 'utf8');
      console.log('[patch] ' + enhancedName + ' created with built-in antigravity adapter and opencode stateful parser');
    }

    if (fs.existsSync(indexHtmlPath)) {
      let html = fs.readFileSync(indexHtmlPath, 'utf8');
      if (!html.includes(enhancedName)) {
        html = html.replace(/src="\/assets\/index[^"]+\.js"/g, 'src="/assets/' + enhancedName + '"');
        fs.writeFileSync(indexHtmlPath, html, 'utf8');
        console.log('[patch] index.html updated to ' + enhancedName);
      }
    }
  }
} catch (e) { console.error('[patch] Error frontend bundle patch:', e.message); }


// 13. ANTIGRAVITY ADAPTER SKILLS SUPPORT
try {
  const srvDist = "/paperclip/adapters/antigravity-local/dist/server/index.js";
  if (fs.existsSync(srvDist)) {
    let code = fs.readFileSync(srvDist, "utf8");
    if (!code.includes("listSkills: listAntigravitySkills")) {
      if (!code.includes("listAntigravitySkills")) {
        code = code.replace(
          'import { getConfigSchema } from "./config.js";',
          'import { getConfigSchema } from "./config.js";\nimport { listAntigravitySkills, syncAntigravitySkills } from "./skills.js";'
        );
      }
      code = code.replace(
        'instructionsPathKey: "instructionsFilePath",',
        'instructionsPathKey: "instructionsFilePath",\n        requiresMaterializedRuntimeSkills: true,\n        listSkills: listAntigravitySkills,\n        syncSkills: syncAntigravitySkills,'
      );
      fs.writeFileSync(srvDist, code, "utf8");
      console.log("[patch] antigravity dist/server/index.js patched with skills support");
    }
  }

  const srvSrc = "/paperclip/adapters/antigravity-local/src/server/index.ts";
  if (fs.existsSync(srvSrc)) {
    let code = fs.readFileSync(srvSrc, "utf8");
    if (!code.includes("listSkills: listAntigravitySkills")) {
      if (!code.includes("listAntigravitySkills")) {
        code = code.replace(
          'import { getConfigSchema } from "./config.js";',
          'import { getConfigSchema } from "./config.js";\nimport { listAntigravitySkills, syncAntigravitySkills } from "./skills.js";'
        );
      }
      code = code.replace(
        'instructionsPathKey: "instructionsFilePath",',
        'instructionsPathKey: "instructionsFilePath",\n    requiresMaterializedRuntimeSkills: true,\n    listSkills: listAntigravitySkills,\n    syncSkills: syncAntigravitySkills,'
      );
      fs.writeFileSync(srvSrc, code, "utf8");
      console.log("[patch] antigravity src/server/index.ts patched with skills support");
    }
  }
} catch (e) { console.error("[patch] Error updating skills support in antigravity adapter:", e.message); }





// OPENCODE AND ANTIGRAVITY INSTRUCTION SYNC FIX (providerStop.collectBeforeRestore)
try {
  const opencodeExecutePath = '/app/packages/adapters/opencode-local/src/server/execute.ts';
  if (fs.existsSync(opencodeExecutePath)) {
    let oc = fs.readFileSync(opencodeExecutePath, 'utf-8');
    let ocChanged = false;
    if (!oc.includes('createProviderStoppedBoundary')) {
      oc = 'import { createProviderStoppedBoundary } from "@paperclipai/adapter-utils/provider-stopped-boundary";\n' + oc;
      ocChanged = true;
    }
    if (!oc.includes('const providerStop = createProviderStoppedBoundary(ctx.onProviderStopped);')) {
      oc = oc.replace(
        'export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {',
        'export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {\n  const providerStop = createProviderStoppedBoundary(ctx.onProviderStopped);'
      );
      ocChanged = true;
    }
    if (!oc.includes('preparedRuntimeConfig.env.AGENT_HOME = path.dirname(resolvedInstructionsFilePath);')) {
      oc = oc.replace(
        'if (instructionsPrefix.length > 0) {',
        'if (resolvedInstructionsFilePath) { preparedRuntimeConfig.env.AGENT_HOME = path.dirname(resolvedInstructionsFilePath); }\n    if (instructionsPrefix.length > 0) {'
      );
      ocChanged = true;
    }
    if (!oc.includes('onProcessStopped: providerStop.beginInvocation(),')) {
      oc = oc.replace(
        'const proc = await runAdapterExecutionTargetProcess(runId, runtimeExecutionTarget, command, args, {',
        'const proc = await runAdapterExecutionTargetProcess(runId, runtimeExecutionTarget, command, args, {\n        onProcessStopped: providerStop.beginInvocation(),'
      );
      ocChanged = true;
    }
    if (!oc.includes('await providerStop.collectBeforeRestore();')) {
      const finRegex = /(\}\s*finally\s*\{\s*)(await\s*Promise\.all\(\[\s*paperclipBridge\?\.stop\(\)[\s\S]*?localSkillsDir[\s\S]*?\]\);)(\s*\})/m;
      if (finRegex.test(oc)) {
        oc = oc.replace(finRegex, (m, p1, p2, p3) => p1 + "try {\n        await providerStop.collectBeforeRestore();\n      } finally {\n        " + p2 + "\n      }" + p3);
        ocChanged = true;
      }
    }
    if (ocChanged) {
      fs.writeFileSync(opencodeExecutePath, oc, 'utf-8');
      console.log('[patch] opencode-local src/server/execute.ts patched with instruction sync hooks');
    }
  }
} catch (e) {
  console.error('[patch] Error applying opencode instruction sync patch:', e.message);
}

// SYNC OPENCODE CONFIG DIRECTORIES (root and paperclip)
try {
  const rootOpencodeDir = '/root/.config/opencode';
  const paperclipOpencodeDir = '/paperclip/.config/opencode';
  if (fs.existsSync(paperclipOpencodeDir)) {
    if (!fs.existsSync('/root/.config')) {
      fs.mkdirSync('/root/.config', { recursive: true });
    }
    const rootConfigPath = '/root/.config/opencode/opencode.json';
    const paperclipConfigPath = '/paperclip/.config/opencode/opencode.json';
    if (!fs.existsSync(rootOpencodeDir)) {
      try {
        fs.symlinkSync(paperclipOpencodeDir, rootOpencodeDir);
        console.log('[patch] Linked /root/.config/opencode -> /paperclip/.config/opencode');
      } catch {
        fs.mkdirSync(rootOpencodeDir, { recursive: true });
      }
    }
    if (fs.existsSync(paperclipConfigPath) && !fs.existsSync(rootConfigPath)) {
      try {
        fs.copyFileSync(paperclipConfigPath, rootConfigPath);
        console.log('[patch] Copied opencode.json to /root/.config/opencode/');
      } catch {}
    }
  }
} catch (e) {
  console.error('[patch] Error syncing opencode config dir:', e.message);
}

// 13. MCP GATEWAY TOOL NAME COMPACTING (Meta/OpenRouter 64-char tool name compatibility)
try {
  const mcpToolNamesDist = '/app/server/dist/services/mcp-tool-names.js';
  if (fs.existsSync(mcpToolNamesDist)) {
    let content = fs.readFileSync(mcpToolNamesDist, 'utf-8');
    if (!content.includes('MAX_GATEWAY_TOOL_NAME_LENGTH = 44')) {
      content = content.replace(
        'export const ASSIGNED_MCP_SERVER_NAME = "paperclip-assigned";',
        'export const ASSIGNED_MCP_SERVER_NAME = "pc";'
      );
      content = content.replace(
        /export const MAX_GATEWAY_TOOL_NAME_LENGTH = [^;]+;/,
        'export const MAX_GATEWAY_TOOL_NAME_LENGTH = 44;'
      );
      content = content.replace(
        'const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);',
        'const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 8);'
      );
      content = content.replace(
        'const namespace = name.slice(0, separator < 0 ? name.length : separator).slice(0, 32);',
        'const namespace = name.slice(0, separator < 0 ? name.length : separator).slice(0, 16);'
      );
      fs.writeFileSync(mcpToolNamesDist, content, 'utf-8');
      console.log('[patch] Compacted MCP gateway tool names for 64-char model compatibility in dist');
    }
  }
  const mcpToolNamesSrc = '/app/server/src/services/mcp-tool-names.ts';
  if (fs.existsSync(mcpToolNamesSrc)) {
    let content = fs.readFileSync(mcpToolNamesSrc, 'utf-8');
    if (!content.includes('MAX_GATEWAY_TOOL_NAME_LENGTH = 44')) {
      content = content.replace(
        'export const ASSIGNED_MCP_SERVER_NAME = "paperclip-assigned";',
        'export const ASSIGNED_MCP_SERVER_NAME = "pc";'
      );
      content = content.replace(
        /export const MAX_GATEWAY_TOOL_NAME_LENGTH = [^;]+;/,
        'export const MAX_GATEWAY_TOOL_NAME_LENGTH = 44;'
      );
      content = content.replace(
        'const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16);',
        'const hash = createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 8);'
      );
      content = content.replace(
        'const namespace = name.slice(0, separator < 0 ? name.length : separator).slice(0, 32);',
        'const namespace = name.slice(0, separator < 0 ? name.length : separator).slice(0, 16);'
      );
      fs.writeFileSync(mcpToolNamesSrc, content, 'utf-8');
      console.log('[patch] Compacted MCP gateway tool names in src');
    }
  }
} catch (e) {
  console.error('[patch] Error patching mcp-tool-names:', e.message);
}

// 14. SYNC NODE_MODULES SYMLINKS FOR EXTERNAL ADAPTERS
try {
  const path = require('node:path');
  const targetDir = process.env.TARGET_DIR || process.env.PAPERCLIP_HOME || '/paperclip';
  const serverNodeModules = '/app/server/node_modules';
  if (fs.existsSync(serverNodeModules)) {
    const paperclipNm = path.join(targetDir, 'node_modules');
    if (!fs.existsSync(paperclipNm)) {
      try {
        fs.symlinkSync(serverNodeModules, paperclipNm);
        console.log('[patch] Linked /paperclip/node_modules -> /app/server/node_modules');
      } catch {}
    }
    const antigravityDir = path.join(targetDir, 'adapters/antigravity-local');
    if (fs.existsSync(antigravityDir)) {
      const antigravityNm = path.join(antigravityDir, 'node_modules');
      if (!fs.existsSync(antigravityNm)) {
        try {
          fs.symlinkSync(serverNodeModules, antigravityNm);
          console.log('[patch] Linked antigravity-local/node_modules -> /app/server/node_modules');
        } catch {}
      }
    }
  }
} catch (e) {
  console.error('[patch] Error syncing adapter node_modules:', e.message);
}

// SYNC AI CONNECTIONS COMPANY INSTALLS IN DATABASE
try {
  const pPath = '/app/node_modules/.pnpm/postgres@3.4.9_patch_hash=sryle6qd5qfmnxvoebal4gashi/node_modules/postgres/src/index.js';
  if (fs.existsSync(pPath)) {
    import(pPath).then(async ({ default: postgres }) => {
      try {
        const sql = postgres("postgres://paperclip:paperclip@127.0.0.1:54329/paperclip", { timeout: 3 });
        const aiConns = await sql`SELECT id, company_id, created_by_user_id FROM tool_connections WHERE connection_purpose = 'ai'`;
        for (const conn of aiConns) {
          const exists = await sql`SELECT id FROM tool_connection_installs WHERE company_id = ${conn.company_id} AND connection_id = ${conn.id} AND target_type = 'company'`;
          if (exists.length === 0) {
            const { randomUUID } = require('node:crypto');
            await sql`INSERT INTO tool_connection_installs (id, company_id, connection_id, target_type, target_id, created_by_user_id, created_at)
              VALUES (${randomUUID()}, ${conn.company_id}, ${conn.id}, 'company', ${conn.company_id}, ${conn.created_by_user_id}, NOW())`;
            console.log('[patch] Auto-installed AI connection ' + conn.id + ' for company ' + conn.company_id);
          }
        }
        await sql.end();
      } catch (err) {
        // silent if db not ready
      }
    }).catch(() => {});
  }
} catch (e) {}

console.log('[patch] Patches completed.');
