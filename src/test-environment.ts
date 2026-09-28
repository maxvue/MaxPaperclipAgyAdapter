import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentTestStatus,
} from "@paperclipai/adapter-utils";
import { ADAPTER_TYPE } from "./constants.js";
import { parseModelsOutput } from "./models.js";
import { stringValue } from "./value-utils.js";

const execFileAsync = promisify(execFile);

function statusFor(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestStatus {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const command = stringValue(ctx.config.command) || "agy";
  const cwd = stringValue(ctx.config.cwd);

  try {
    const { stdout } = await execFileAsync(command, ["--version"], {
      timeout: 20_000,
    });
    checks.push({
      code: "agy_detected",
      level: "info",
      message: `Antigravity CLI encontrado: ${stdout.trim().split(/\r?\n/)[0] || command}.`,
    });
  } catch (error) {
    checks.push({
      code: "agy_missing",
      level: "error",
      message: `Não foi possível executar "${command} --version".`,
      detail: errorText(error),
      hint: "Instale o Antigravity CLI e confirme que o comando agy está no PATH do Paperclip.",
    });
  }

  if (cwd) {
    if (!path.isAbsolute(cwd)) {
      checks.push({
        code: "cwd_relative",
        level: "error",
        message: `O diretório de trabalho precisa ser absoluto: ${cwd}`,
      });
    } else {
      try {
        const stat = await fs.stat(cwd);
        checks.push({
          code: "cwd_available",
          level: stat.isDirectory() ? "info" : "error",
          message: stat.isDirectory()
            ? `Diretório de trabalho disponível: ${cwd}`
            : `O caminho configurado não é um diretório: ${cwd}`,
        });
      } catch {
        checks.push({
          code: "cwd_will_be_created",
          level: "warn",
          message: `O diretório ainda não existe e será criado na primeira execução: ${cwd}`,
        });
      }
    }
  }

  try {
    const { stdout } = await execFileAsync(command, ["models"], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const models = parseModelsOutput(stdout);
    checks.push({
      code: models.length > 0 ? "agy_authenticated" : "agy_models_empty",
      level: models.length > 0 ? "info" : "warn",
      message:
        models.length > 0
          ? `Autenticação válida; ${models.length} modelos disponíveis.`
          : "O agy respondeu, mas não listou modelos.",
      hint: models.length > 0 ? null : "Execute agy interativamente e conclua o login.",
    });
  } catch (error) {
    checks.push({
      code: "agy_models_failed",
      level: "error",
      message: "Não foi possível consultar os modelos do Antigravity.",
      detail: errorText(error),
      hint: "Execute agy interativamente e conclua ou renove o login.",
    });
  }

  if (ctx.config.permissionMode === "workspace") {
    checks.push({
      code: "workspace_permissions_enabled",
      level: "warn",
      message: "O sandbox do Antigravity está desativado para este agente.",
      hint: "Use o modo sandbox, exceto quando alterações diretas no workspace forem necessárias.",
    });
  }

  return {
    adapterType: ADAPTER_TYPE,
    status: statusFor(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}

