const fs = require('fs');

console.log('[patch] Running Paperclip runtime patches on dist and src...');

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

// 2. SHARED DIST AI-CONNECTIONS (Runtime compatibility)
try {
  const sharedDist = '/app/packages/shared/dist/ai-connections.js';
  if (fs.existsSync(sharedDist)) {
    let s = fs.readFileSync(sharedDist, 'utf-8');
    if (!s.includes('if (adapterType === "antigravity_local") return true;')) {
      s = s.replace(
        'export function isAiConnectionCompatible(requirement, adapterType, model, runnerProvider, acpxAgent) {',
        'export function isAiConnectionCompatible(requirement, adapterType, model, runnerProvider, acpxAgent) {\n    if (adapterType === "antigravity_local") return true;'
      );
      fs.writeFileSync(sharedDist, s, 'utf-8');
      console.log('[patch] packages/shared/dist/ai-connections.js patched successfully');
    }
  }
} catch (e) {
  console.error('[patch] Error shared dist:', e.message);
}

// 3. SERVER DIST ROUTES AGENTS (Runtime routes)
try {
  const agentsDist = '/app/server/dist/routes/agents.js';
  if (fs.existsSync(agentsDist)) {
    let a = fs.readFileSync(agentsDist, 'utf-8');
    
    // 3a. Update Agent route: strip aiConnection when saving antigravity_local
    const oldCode = 'if (existing.runtimeConfig.aiConnection && requestedRuntimeConfig && !requestedRuntimeConfig.aiConnection)\n            requestedRuntimeConfig.aiConnection = existing.runtimeConfig.aiConnection;';
    const newCode = `if (requestedAdapterType === "antigravity_local") {
            if (requestedRuntimeConfig) delete requestedRuntimeConfig.aiConnection;
            if (existing.runtimeConfig) delete existing.runtimeConfig.aiConnection;
            if (patchData.runtimeConfig) delete patchData.runtimeConfig.aiConnection;
        } else if (existing.runtimeConfig.aiConnection && requestedRuntimeConfig && !requestedRuntimeConfig.aiConnection) {
            requestedRuntimeConfig.aiConnection = existing.runtimeConfig.aiConnection;
        }`;
    if (a.includes('existing.runtimeConfig.aiConnection && requestedRuntimeConfig && !requestedRuntimeConfig.aiConnection')) {
      a = a.replace(/if\s*\(existing\.runtimeConfig\.aiConnection\s*&&\s*requestedRuntimeConfig\s*&&\s*!requestedRuntimeConfig\.aiConnection\)\s*requestedRuntimeConfig\.aiConnection\s*=\\s*existing\.runtimeConfig\.aiConnection;/s, newCode);
      console.log('[patch] server/dist/routes/agents.js (update agent) patched');
    }

    // 3b. Test-Environment route: ignore aiBinding for antigravity_local
    const oldTestBinding = 'const aiBinding = req.body.aiConnection ? aiConnectionBindingSchema.parse(req.body.aiConnection) : undefined;';
    const newTestBinding = 'const aiBinding = (type === "antigravity_local") ? undefined : (req.body.aiConnection ? aiConnectionBindingSchema.parse(req.body.aiConnection) : undefined);';
    if (a.includes(oldTestBinding)) {
      a = a.replace(oldTestBinding, newTestBinding);
      console.log('[patch] server/dist/routes/agents.js (test-environment) patched');
    }

    fs.writeFileSync(agentsDist, a, 'utf-8');
  }
} catch (e) {
  console.error('[patch] Error server dist agents:', e.message);
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

    if (!fs.existsSync(bundlePath)) {
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
        html = html.replace(/src="\/assets\/index-[^"]+\.js"/g, 'src="/assets/' + enhancedName + '"');
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
