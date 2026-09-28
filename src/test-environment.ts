import path from "node:path";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentTestStatus,
} from "@paperclipai/adapter-utils";
import {
  ensureAdapterExecutionTargetDirectory,
  adapterExecutionTargetIsRemote,
  resolveAdapterExecutionTargetCwd,
  runAdapterExecutionTargetProcess,
} from "@paperclipai/adapter-utils/execution-target";
import { ADAPTER_TYPE } from "./constants.js";
import { parseModelsOutput } from "./models.js";
import { stringValue } from "./value-utils.js";

function statusFor(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestStatus {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function versionTuple(value: string): [number, number, number] | null {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function atLeast(value: [number, number, number], minimum: [number, number, number]): boolean {
  return value[0] > minimum[0] || (value[0] === minimum[0] && (value[1] > minimum[1] || (value[1] === minimum[1] && value[2] >= minimum[2])));
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const command = stringValue(ctx.config.command) || "agy";
  const configuredCwd = stringValue(ctx.config.cwd);
  if (configuredCwd && !path.isAbsolute(configuredCwd)) {
    checks.push({ code: "cwd_relative", level: "error", message: `O diretório de trabalho precisa ser absoluto: ${configuredCwd}` });
  }
  const cwd = resolveAdapterExecutionTargetCwd(ctx.executionTarget, configuredCwd || process.cwd(), process.cwd());
  const runId = `agy-env-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const allowedEnvironment: Record<string, string> = Object.fromEntries(
    ["PATH", "HOME", "USER", "LANG", "LC_ALL", "XDG_CONFIG_HOME", "GEMINI_API_KEY", "GOOGLE_API_KEY"]
      .flatMap((key) => process.env[key] ? [[key, process.env[key] as string]] : []),
  );
  const environment = adapterExecutionTargetIsRemote(ctx.executionTarget)
    ? allowedEnvironment
    : Object.assign(
        Object.fromEntries(Object.keys(process.env).map((key) => [key, undefined])),
        allowedEnvironment,
      ) as Record<string, string>;
  const run = (args: string[], timeoutSec: number) => runAdapterExecutionTargetProcess(runId, ctx.executionTarget, command, args, {
    cwd,
    env: environment,
    timeoutSec,
    graceSec: 3,
    onLog: async () => {},
  });

  try {
    await ensureAdapterExecutionTargetDirectory(runId, ctx.executionTarget, cwd, {
      cwd, env: environment, timeoutSec: 20, graceSec: 3, createIfMissing: true,
    });
    checks.push({ code: "cwd_available", level: "info", message: `Diretório de trabalho disponível no ambiente: ${cwd}` });
  } catch (error) {
    checks.push({ code: "cwd_unavailable", level: "error", message: `Diretório indisponível no ambiente: ${cwd}`, detail: String(error) });
  }

  try {
    const result = await run(["--version"], 20);
    if (result.exitCode !== 0) throw new Error(result.stderr || `código ${result.exitCode}`);
    const label = result.stdout.trim().split(/\r?\n/)[0] || command;
    const version = versionTuple(label);
    const supported = version ? atLeast(version, [1, 1, 15]) : false;
    checks.push({
      code: supported ? "agy_detected" : "agy_version_unsupported",
      level: supported ? "info" : "error",
      message: supported ? `Antigravity CLI encontrado: ${label}.` : `Versão do agy não suportada: ${label}.`,
      hint: supported ? null : "Atualize para agy 1.1.15 ou superior; recomenda-se 1.2.12 ou superior.",
    });
    if (version && supported && !atLeast(version, [1, 2, 6])) {
      checks.push({ code: "agy_structured_errors_limited", level: "warn", message: "Esta versão não oferece todos os erros estruturados AGY_ERROR.", hint: "Atualize para agy 1.2.6 ou superior." });
    }
  } catch (error) {
    checks.push({ code: "agy_missing", level: "error", message: `Não foi possível executar "${command} --version".`, detail: String(error) });
  }

  try {
    const result = await run(["--output-format", "json", "models"], 30);
    if (result.exitCode !== 0) throw new Error(result.stderr || `código ${result.exitCode}`);
    const models = parseModelsOutput(result.stdout);
    checks.push({
      code: models.length > 0 ? "agy_authenticated" : "agy_models_empty",
      level: models.length > 0 ? "info" : "warn",
      message: models.length > 0 ? `Autenticação válida; ${models.length} modelos disponíveis.` : "O agy respondeu, mas não listou modelos.",
      hint: models.length > 0 ? null : "Execute agy interativamente e conclua o login.",
    });
  } catch (error) {
    checks.push({ code: "agy_models_failed", level: "error", message: "Não foi possível consultar os modelos do Antigravity.", detail: String(error) });
  }

  if (ctx.config.permissionMode === "workspace") {
    checks.push({ code: "workspace_permissions_enabled", level: "warn", message: "A aprovação automática está habilitada sem sandbox de terminal." });
  }
  return { adapterType: ADAPTER_TYPE, status: statusFor(checks), checks, testedAt: new Date().toISOString() };
}
