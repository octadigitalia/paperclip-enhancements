// Antigravity UI parser

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

if(typeof exports!=='undefined'){exports.parseStdoutLine=parseStdoutLine;}
if(typeof module!=='undefined'&&module.exports){module.exports={parseStdoutLine:parseStdoutLine};}
