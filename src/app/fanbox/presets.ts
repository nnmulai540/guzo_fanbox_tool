import type { FitMode, PadBackground } from "./imageProcessing";

export type SavedPreset = {
  schemaVersion: 1;
  name: string;
  presetId: string;
  mode: FitMode;
  background: PadBackground;
  maxDimension: number;
  maxSizeMB: number;
  quality: number;
};

const STORAGE_KEY = "fanbox-tool:saved-presets";

export function loadSavedPresets(): SavedPreset[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedPreset => p && typeof p === "object" && p.schemaVersion === 1 && typeof p.name === "string"
    );
  } catch {
    return [];
  }
}

// 保存に成功したかどうかを返す（Safariプライベートモード等での失敗をUI側で拾えるように）
export function saveSavedPresets(presets: SavedPreset[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

export function upsertSavedPreset(preset: SavedPreset): { presets: SavedPreset[]; success: boolean } {
  const existing = loadSavedPresets().filter((p) => p.name !== preset.name);
  const next = [...existing, preset];
  const success = saveSavedPresets(next);
  return { presets: next, success };
}

export function deleteSavedPreset(name: string): SavedPreset[] {
  const next = loadSavedPresets().filter((p) => p.name !== name);
  saveSavedPresets(next);
  return next;
}
