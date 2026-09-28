import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AdapterModel } from "@paperclipai/adapter-utils";
import { DEFAULT_MODEL } from "./constants.js";

const execFileAsync = promisify(execFile);
const fallbackModels: AdapterModel[] = [
  { id: DEFAULT_MODEL, label: "Padrão do Antigravity (automático)" },
];

export function parseModelsOutput(stdout: string): AdapterModel[] {
  const models: AdapterModel[] = [];
  const seen = new Set<string>();
  try {
    const decoded: unknown = JSON.parse(stdout.trim());
    if (typeof decoded === "object" && decoded !== null) {
      const command = (decoded as Record<string, unknown>).command;
      const data = typeof command === "object" && command !== null
        ? (command as Record<string, unknown>).data
        : null;
      const entries = typeof data === "object" && data !== null
        ? (data as Record<string, unknown>).models
        : null;
      if (Array.isArray(entries)) {
        for (const entry of entries) {
          if (typeof entry !== "object" || entry === null) continue;
          const id = String((entry as Record<string, unknown>).id ?? "").trim();
          const label = String((entry as Record<string, unknown>).label ?? id).trim();
          if (id && !seen.has(id)) {
            seen.add(id);
            models.push({ id, label: label || id });
          }
        }
        if (models.length > 0) return models;
      }
    }
  } catch {
    // Compatibilidade com versões antigas que retornam uma tabela TSV.
  }
  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine.includes("\t")) continue;
    const [rawId, ...rawLabel] = rawLine.split("\t");
    const id = rawId?.trim() ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = rawLabel.join(" ").trim();
    models.push({ id, label: label || id });
  }
  return models;
}

export async function listModels(command = "agy"): Promise<AdapterModel[]> {
  try {
    const { stdout } = await execFileAsync(command, ["--output-format", "json", "models"], {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const discovered = parseModelsOutput(stdout);
    return discovered.length > 0 ? [...fallbackModels, ...discovered] : fallbackModels;
  } catch {
    return fallbackModels;
  }
}

export function inferProvider(model: string): string {
  const normalized = model.toLowerCase();
  if (!normalized || normalized === DEFAULT_MODEL) return "antigravity";
  if (normalized.startsWith("claude")) return "anthropic";
  if (normalized.startsWith("gpt") || normalized.startsWith("o1") || normalized.startsWith("o3")) {
    return "openai";
  }
  if (normalized.startsWith("gemini")) return "google";
  return "antigravity";
}

export { fallbackModels as models };
