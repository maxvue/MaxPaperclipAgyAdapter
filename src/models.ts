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
    const { stdout } = await execFileAsync(command, ["models"], {
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
  return "google";
}

export { fallbackModels as models };
