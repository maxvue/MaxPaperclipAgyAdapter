"use strict";

// Este arquivo é avaliado pelo Paperclip num Web Worker isolado. Por isso, ele
// não possui imports, acesso à rede ou estado persistente.
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function number(value) {
  return typeof value === "number" && isFinite(value) ? value : 0;
}

function toolId(conversationId, stepIndex) {
  return (conversationId || "agy") + ":" + stepIndex;
}

function parseStdoutLine(line, ts) {
  var trimmed = text(line).trim();
  if (!trimmed) return [];
  if (trimmed.charAt(0) !== "{") {
    return [{ kind: /^\s*(?:error|fatal|panic)\b/i.test(trimmed) ? "stderr" : "stdout", ts: ts, text: trimmed }];
  }

  var event;
  try {
    event = record(JSON.parse(trimmed));
  } catch (_error) {
    return [{ kind: "stdout", ts: ts, text: trimmed }];
  }
  if (!event) return [];

  if (event.event === "init") {
    var init = record(event.init) || {};
    return [{
      kind: "init",
      ts: ts,
      model: text(init.model).trim() || "antigravity",
      sessionId: text(event.conversation_id).trim(),
    }];
  }

  if (event.event === "step_update") {
    var step = record(event.step_update);
    if (!step) return [];
    if (step.step_type === "agent_response") {
      var delta = text(step.text_delta);
      return delta ? [{ kind: "assistant", ts: ts, text: delta, delta: true }] : [];
    }
    if (step.step_type === "user_input") {
      var userText = text(step.text_delta);
      return userText ? [{ kind: "user", ts: ts, text: userText }] : [];
    }
    if (step.step_type === "tool") {
      var info = record(step.tool_info) || {};
      var name = text(step.tool_name).trim() || text(info.name).trim() || "tool";
      var id = toolId(text(step.conversation_id).trim(), number(step.step_index));
      var parameters = record(info.parameters) || {};
      if (step.state === "DONE") {
        return [{
          kind: "tool_result",
          ts: ts,
          toolUseId: id,
          toolName: name,
          content: text(info.output).trim() || name + " concluída",
          isError: info.error !== undefined && info.error !== null,
        }];
      }
      return [{ kind: "tool_call", ts: ts, name: name, input: parameters, toolUseId: id }];
    }
    return [];
  }

  if (event.event === "result") {
    var result = record(event.result) || {};
    var usage = record(result.usage) || {};
    var status = text(result.status).trim() || "UNKNOWN";
    var failed = status !== "SUCCESS";
    var error = text(result.error_message).trim() || text(result.error).trim();
    return [{
      kind: "result",
      ts: ts,
      text: status,
      inputTokens: number(usage.input_tokens),
      outputTokens: number(usage.output_tokens),
      cachedTokens: number(usage.cache_read_tokens),
      costUsd: 0,
      subtype: status.toLowerCase(),
      isError: failed,
      errors: failed && error ? [error] : [],
    }];
  }

  // Eventos novos permanecem visíveis, facilitando a detecção de mudanças no protocolo.
  return [{ kind: "stdout", ts: ts, text: trimmed }];
}

module.exports = { parseStdoutLine: parseStdoutLine };

