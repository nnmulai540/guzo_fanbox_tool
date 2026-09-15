"use client";

import { useEffect, useRef, useState } from "react";
import CropEditorModal from "../fanbox/CropEditorModal";
import {
  PRESETS,
  effectiveRatio,
  processImageItem,
  outputFormatFor,
  extensionOf,
  IMAGE_EXTENSIONS,
  type ImageItem,
  type OutputPreset,
} from "../fanbox/imageProcessing";
import { saveImage } from "./storage";
import { moveItem } from "./reorder";

type Props = {
  onClose: () => void;
  onInsert: (imageIds: string[]) => void;
};

// 記事本文用の画像は、FANBOXカバーのような特殊なプリセットを除けば
// 現行の /fanbox ツールの本文向けデフォルトと同じ値に固定する（設定UIは出さない）
const FIXED_MAX_DIMENSION = 1200;
const FIXED_MAX_SIZE_MB = 2;

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

export default function ImageInsertModal({ onClose, onInsert }: Props) {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [presetId, setPresetId] = useState<OutputPreset["id"]>(PRESETS[0].id);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragCounterRef = useRef(0);
  const itemsRef = useRef<ImageItem[]>(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    };
  }, []);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const ratio = effectiveRatio(preset);

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

  const move = (id: string, to: number | "up" | "down" | "top" | "bottom") => {
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === id);
      if (from === -1) return prev;
      const target =
        to === "up" ? from - 1 : to === "down" ? from + 1 : to === "top" ? 0 : to === "bottom" ? prev.length - 1 : to;
      return moveItem(prev, from, target);
    });
  };

  // デスクトップのマウスドラッグによる並び替え（タッチ端末では機能しないため、
  // ドラッグハンドルの見た目はsm以上でのみ表示する）
  const dragFromIdRef = useRef<string | null>(null);
  const handleDragStart = (id: string) => {
    dragFromIdRef.current = id;
  };
  const handleDropReorder = (targetId: string) => {
    const fromId = dragFromIdRef.current;
    dragFromIdRef.current = null;
    if (!fromId || fromId === targetId) return;
    setItems((prev) => {
      const from = prev.findIndex((it) => it.id === fromId);
      const to = prev.findIndex((it) => it.id === targetId);
      if (from === -1 || to === -1) return prev;
      return moveItem(prev, from, to);
    });
  };

  const editingItem = items.find((it) => it.id === editingItemId) ?? null;

  const saveEditorResult: React.ComponentProps<typeof CropEditorModal>["onSave"] = (crop, zoom, croppedAreaPixels) => {
    if (!editingItem) return;
    setItems((prev) => prev.map((it) => (it.id === editingItem.id ? { ...it, crop, zoom, croppedAreaPixels } : it)));
  };

  const handleInsert = async () => {
    if (items.length === 0) return;
    setProcessing(true);
    setError(null);

    const settings = {
      preset,
      mode: "cover" as const,
      background: { kind: "white" as const },
      maxDimension: FIXED_MAX_DIMENSION,
      maxSizeMB: FIXED_MAX_SIZE_MB,
    };

    const insertedIds: string[] = [];
    const failedNames: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const result = await processImageItem(item, settings, i);
        const imageId = crypto.randomUUID();
        const mimeType = outputFormatFor(extensionOf(item.file.name)).mime;
        // 先に画像を保存してから記事側の参照を作る（保存に失敗した画像を指す
        // ダングリング参照を残さないため）
        await saveImage(imageId, {
          blob: result.blob,
          width: result.width,
          height: result.height,
          mimeType,
          sizeKB: result.sizeKB,
        });
        URL.revokeObjectURL(result.url);
        insertedIds.push(imageId);
      } catch {
        failedNames.push(item.file.name);
      }
    }

    setProcessing(false);

    if (insertedIds.length > 0) onInsert(insertedIds);
    if (failedNames.length > 0) {
      setError(`次の画像の保存に失敗しました: ${failedNames.join("、")}`);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-background p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium">画像を追加</h3>

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
        </div>

        {items.length > 0 && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">切り抜き比率</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPresetId(p.id)}
                    className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
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

            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropReorder(item.id)}
                  className="flex flex-col gap-1.5"
                >
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない */}
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-full aspect-square object-cover rounded-lg border border-zinc-200 dark:border-zinc-800"
                    />
                    <span className="hidden sm:flex absolute top-1 left-1 h-5 w-5 items-center justify-center rounded-full bg-foreground/80 text-[10px] text-background cursor-grab">
                      ⠿
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate">{item.file.name}</p>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      disabled={ratio === null}
                      onClick={() => setEditingItemId(item.id)}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(item.id, "up")}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => move(item.id, "down")}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400"
                    >
                      削除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:border-zinc-400"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={items.length === 0 || processing}
            onClick={handleInsert}
            className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:opacity-40"
          >
            {processing ? "処理中…" : "記事に追加"}
          </button>
        </div>
      </div>

      {editingItem && ratio !== null && (
        <CropEditorModal
          item={editingItem}
          ratio={ratio}
          onClose={() => setEditingItemId(null)}
          onSave={saveEditorResult}
        />
      )}
    </div>
  );
}
