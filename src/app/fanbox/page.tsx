"use client";

import { useEffect, useRef, useState } from "react";
import type { Area as CropArea, Point } from "react-easy-crop";
import CropEditorModal from "./CropEditorModal";
import {
  PRESETS,
  effectiveRatio,
  computeCoverOutputSize,
  processImageItem,
  IMAGE_EXTENSIONS,
  extensionOf,
  type ImageItem,
  type ResultItem,
  type FitMode,
  type PadBackground,
} from "./imageProcessing";
import {
  loadSavedPresets,
  upsertSavedPreset,
  deleteSavedPreset,
  type SavedPreset,
} from "./presets";

const BACKGROUND_OPTIONS: { kind: PadBackground["kind"]; label: string }[] = [
  { kind: "white", label: "白" },
  { kind: "black", label: "黒" },
  { kind: "custom", label: "カスタムカラー" },
  { kind: "auto", label: "元画像から自動取得" },
  { kind: "blur", label: "元画像をぼかす" },
];

function createImageItem(file: File): ImageItem {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    crop: { x: 0, y: 0 },
    zoom: 1,
    croppedAreaPixels: null,
  };
}

function filterImageFiles(fileList: FileList | File[]): File[] {
  return Array.from(fileList).filter((f) => IMAGE_EXTENSIONS.includes(extensionOf(f.name)));
}

export default function FanboxToolPage() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [mode, setMode] = useState<FitMode>("cover");
  const [background, setBackground] = useState<PadBackground>({ kind: "white" });
  const [maxDimension, setMaxDimension] = useState(2048);
  const [maxSizeMB, setMaxSizeMB] = useState(10);
  const [quality, setQuality] = useState(0.85);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [selectedSavedPresetName, setSelectedSavedPresetName] = useState("");
  const [newPresetName, setNewPresetName] = useState("");
  const [presetNotice, setPresetNotice] = useState<string | null>(null);

  const dragCounterRef = useRef(0);
  const itemsRef = useRef<ImageItem[]>(items);
  const resultsRef = useRef<ResultItem[]>(results);

  // アンマウント時のobject URL解放で最新の配列を参照できるよう、refをレンダー後に同期する
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    // localStorageはブラウザでしか読めないため、SSRとのハイドレーション不一致を避けてマウント後に読み込む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedPresets(loadSavedPresets());
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
      resultsRef.current.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, []);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const ratio = effectiveRatio(preset);
  const canPad = ratio !== null; // 「元の比率のまま」では余白を追加する意味がない

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    setItems((prev) => [...prev, ...files.map(createImageItem)]);
    setError(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(filterImageFiles(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingOver(true);
  };

  // 子要素をまたぐたびにdragleave/dragenterが発火するため、カウンタでチラつきを防ぐ
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    addFiles(filterImageFiles(e.dataTransfer.files));
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  const editingItem = items.find((it) => it.id === editingItemId) ?? null;

  const saveEditorResult = (id: string, crop: Point, zoom: number, croppedAreaPixels: CropArea | null) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, crop, zoom, croppedAreaPixels } : it)));
  };

  const handleConvert = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    setError(null);
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);

    const settings = { preset, mode, background, maxDimension, maxSizeMB, quality };
    const output: ResultItem[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const result = await processImageItem(items[i], settings, i);
        output.push(result);
        setResults([...output]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "変換中にエラーが発生しました");
    } finally {
      setProcessing(false);
    }
  };

  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const saved: SavedPreset = { schemaVersion: 1, name, presetId, mode, background, maxDimension, maxSizeMB, quality };
    const { presets, success } = upsertSavedPreset(saved);
    setSavedPresets(presets);
    setSelectedSavedPresetName(name);
    setNewPresetName("");
    setPresetNotice(success ? `「${name}」を保存しました` : "保存に失敗しました（ブラウザの設定をご確認ください）");
  };

  const handleLoadPreset = () => {
    const saved = savedPresets.find((p) => p.name === selectedSavedPresetName);
    if (!saved) return;
    setPresetId(saved.presetId);
    setMode(saved.mode);
    setBackground(saved.background);
    setMaxDimension(saved.maxDimension);
    setMaxSizeMB(saved.maxSizeMB);
    setQuality(saved.quality);
    setPresetNotice(`「${saved.name}」を読み込みました`);
  };

  const handleDeletePreset = () => {
    if (!selectedSavedPresetName) return;
    setSavedPresets(deleteSavedPreset(selectedSavedPresetName));
    setPresetNotice(`「${selectedSavedPresetName}」を削除しました`);
    setSelectedSavedPresetName("");
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold mb-2">FANBOX画像リサイズツール</h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-8">
        画像をまとめてアップロードし、比率・トリミング位置・余白を指定してリサイズ・圧縮します。処理はすべてブラウザ内で行われ、画像はサーバーに送信されません。出力画像からはEXIFなどの撮影メタデータも自動的に削除されます。
      </p>

      <div className="flex flex-col gap-8">
        {/* 画像追加 */}
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDraggingOver ? "border-foreground bg-zinc-100 dark:bg-zinc-900" : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          <label className="block text-sm font-medium mb-2">画像を選択、またはドラッグ&amp;ドロップ（複数可）</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileInputChange}
            className="mx-auto block text-sm file:mr-4 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-background file:text-sm"
          />
          {items.length > 0 && <p className="mt-2 text-sm text-zinc-500">{items.length}枚選択中</p>}
        </div>

        {/* 選択画像一覧 */}
        {items.length > 0 && (
          <div>
            <h2 className="text-lg font-medium mb-3">選択中の画像</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {items.map((item) => {
                const outputSize =
                  mode === "cover" && item.croppedAreaPixels
                    ? computeCoverOutputSize(item.croppedAreaPixels, preset, maxDimension)
                    : null;
                const lowQualityWarning =
                  outputSize && item.croppedAreaPixels && outputSize.width > item.croppedAreaPixels.width;

                return (
                  <li key={item.id} className="flex flex-col gap-2">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない */}
                      <img
                        src={item.previewUrl}
                        alt={item.file.name}
                        className="w-full aspect-square object-cover rounded-lg border border-zinc-200 dark:border-zinc-800"
                      />
                      {item.croppedAreaPixels && (
                        <span className="absolute top-1 left-1 rounded-full bg-foreground/80 px-2 py-0.5 text-[10px] text-background">
                          調整済み
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{item.file.name}</p>
                    {lowQualityWarning && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        元画像が小さいため画質が低下する可能性があります
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={mode !== "cover" || ratio === null}
                        onClick={() => setEditingItemId(item.id)}
                        className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:border-zinc-400 disabled:opacity-40"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:border-zinc-400"
                      >
                        削除
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 出力設定 */}
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-medium">出力設定</h2>

          <div>
            <label className="block text-sm font-medium mb-2">出力サイズ</label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPresetId(p.id)}
                  className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                    presetId === p.id
                      ? "bg-foreground text-background border-foreground"
                      : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {canPad && (
            <div>
              <label className="block text-sm font-medium mb-2">はみ出た部分の扱い</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("cover")}
                  className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                    mode === "cover"
                      ? "bg-foreground text-background border-foreground"
                      : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  切り抜く
                </button>
                <button
                  type="button"
                  onClick={() => setMode("contain")}
                  className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                    mode === "contain"
                      ? "bg-foreground text-background border-foreground"
                      : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
                  }`}
                >
                  画像全体を残して余白を追加する
                </button>
              </div>
            </div>
          )}

          {canPad && mode === "contain" && (
            <div>
              <label className="block text-sm font-medium mb-2">余白の背景</label>
              <div className="flex flex-wrap items-center gap-2">
                {BACKGROUND_OPTIONS.map((opt) => (
                  <button
                    key={opt.kind}
                    type="button"
                    onClick={() => setBackground(opt.kind === "custom" ? { kind: "custom", color: "#ffffff" } : { kind: opt.kind })}
                    className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                      background.kind === opt.kind
                        ? "bg-foreground text-background border-foreground"
                        : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {background.kind === "custom" && (
                  <input
                    type="color"
                    value={background.color}
                    onChange={(e) => setBackground({ kind: "custom", color: e.target.value })}
                    className="h-9 w-9 rounded border border-zinc-300 dark:border-zinc-700"
                  />
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                長辺の最大ピクセル数{preset.fixedSize ? "" : `: ${maxDimension}px`}
              </label>
              {preset.fixedSize ? (
                <p className="text-sm text-zinc-500">
                  {preset.fixedSize.width}×{preset.fixedSize.height}px 固定
                </p>
              ) : (
                <input
                  type="range"
                  min={512}
                  max={4096}
                  step={128}
                  value={maxDimension}
                  onChange={(e) => setMaxDimension(Number(e.target.value))}
                  className="w-full"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">最大ファイルサイズ: {maxSizeMB}MB</label>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={maxSizeMB}
                onChange={(e) => setMaxSizeMB(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">JPEG品質: {Math.round(quality * 100)}%</label>
              <input
                type="range"
                min={40}
                max={100}
                step={5}
                value={Math.round(quality * 100)}
                onChange={(e) => setQuality(Number(e.target.value) / 100)}
                className="w-full"
              />
            </div>
          </div>

          {/* 保存済み設定プリセット */}
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col gap-3">
            <label className="block text-sm font-medium">設定プリセット</label>
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={selectedSavedPresetName}
                onChange={(e) => setSelectedSavedPresetName(e.target.value)}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm"
              >
                <option value="">保存済み設定を選択</option>
                {savedPresets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!selectedSavedPresetName}
                onClick={handleLoadPreset}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-400 disabled:opacity-40"
              >
                読み込む
              </button>
              <button
                type="button"
                disabled={!selectedSavedPresetName}
                onClick={handleDeletePreset}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-400 disabled:opacity-40"
              >
                削除
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="新しい設定名"
                className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={!newPresetName.trim()}
                onClick={handleSavePreset}
                className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-400 disabled:opacity-40"
              >
                現在の設定を保存
              </button>
            </div>
            {presetNotice && <p className="text-xs text-zinc-500">{presetNotice}</p>}
          </div>
        </div>

        <button
          type="button"
          onClick={handleConvert}
          disabled={items.length === 0 || processing}
          className="rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:opacity-40"
        >
          {processing ? "変換中…" : "変換する"}
        </button>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* 結果 */}
        {results.length > 0 && (
          <div>
            <h2 className="text-lg font-medium mb-4">結果（{results.length}枚）</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {results.map((r) => (
                <li key={r.key} className="flex flex-col gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[11px] text-zinc-500 mb-1">変換前</p>
                      {/* eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない */}
                      <img
                        src={r.originalPreviewUrl}
                        alt={`${r.fileName}（変換前）`}
                        className="w-full aspect-square object-contain rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
                      />
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500 mb-1">変換後</p>
                      {/* eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない */}
                      <img
                        src={r.url}
                        alt={r.fileName}
                        className="w-full aspect-square object-cover rounded-lg border border-zinc-200 dark:border-zinc-800"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500 truncate">{r.fileName}</p>
                  <p className="text-xs text-zinc-500">
                    {r.width}×{r.height} / {r.sizeKB.toFixed(0)}KB
                  </p>
                  <a
                    href={r.url}
                    download={r.fileName}
                    className="text-center text-sm rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 hover:border-zinc-400"
                  >
                    ダウンロード
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editingItem && ratio !== null && (
        <CropEditorModal
          item={editingItem}
          ratio={ratio}
          onClose={() => setEditingItemId(null)}
          onSave={(crop, zoom, croppedAreaPixels) => saveEditorResult(editingItem.id, crop, zoom, croppedAreaPixels)}
        />
      )}
    </main>
  );
}
