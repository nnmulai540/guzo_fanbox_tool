"use client";

import { useState } from "react";

type Preset = {
  id: string;
  label: string;
  ratio: number | null; // width / height。nullなら切り抜きなし
};

const PRESETS: Preset[] = [
  { id: "original", label: "元の比率のまま", ratio: null },
  { id: "square", label: "正方形 (1:1)", ratio: 1 },
  { id: "portrait", label: "縦長 (4:5)", ratio: 4 / 5 },
  { id: "landscape", label: "横長 (16:9)", ratio: 16 / 9 },
];

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

type ResultItem = {
  key: string;
  fileName: string;
  url: string;
  width: number;
  height: number;
  sizeKB: number;
};

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

// 拡張子から出力フォーマットを決める。JPEG/WebPは品質調整で圧縮し、PNG/GIFはPNGとしてそのまま書き出す
function outputFormatFor(ext: string): { mime: string; outExt: string; supportsQuality: boolean } {
  if (ext === "jpg" || ext === "jpeg") return { mime: "image/jpeg", outExt: "jpg", supportsQuality: true };
  if (ext === "webp") return { mime: "image/webp", outExt: "webp", supportsQuality: true };
  return { mime: "image/png", outExt: "png", supportsQuality: false };
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像の書き出しに失敗しました"))),
      mime,
      quality
    );
  });
}

// 品質を段階的に下げながら、ファイルサイズが上限に収まるまで書き出す
async function encodeUnderSizeLimit(
  canvas: HTMLCanvasElement,
  mime: string,
  supportsQuality: boolean,
  maxBytes: number
): Promise<Blob> {
  if (!supportsQuality) {
    return canvasToBlob(canvas, mime);
  }
  let quality = 0.95;
  let blob = await canvasToBlob(canvas, mime, quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, mime, quality);
  }
  return blob;
}

// 指定した比率にあわせて中心から切り抜く範囲を求める
function centerCropRect(width: number, height: number, ratio: number | null) {
  if (ratio === null) {
    return { sx: 0, sy: 0, sw: width, sh: height };
  }
  const sourceRatio = width / height;
  if (sourceRatio > ratio) {
    const sh = height;
    const sw = Math.round(sh * ratio);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh };
  }
  const sw = width;
  const sh = Math.round(sw / ratio);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw, sh };
}

async function processFile(
  file: File,
  ratio: number | null,
  maxDimension: number,
  maxSizeMB: number,
  index: number
): Promise<ResultItem> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const { sx, sy, sw, sh } = centerCropRect(bitmap.width, bitmap.height, ratio);
  const longestSide = Math.max(sw, sh);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvasの初期化に失敗しました");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  bitmap.close();

  const ext = extensionOf(file.name);
  const { mime, outExt, supportsQuality } = outputFormatFor(ext);
  const blob = await encodeUnderSizeLimit(canvas, mime, supportsQuality, maxSizeMB * 1024 * 1024);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const fileName = `${String(index + 1).padStart(2, "0")}_${baseName}.${outExt}`;

  return {
    key: `${fileName}-${index}`,
    fileName,
    url: URL.createObjectURL(blob),
    width: dw,
    height: dh,
    sizeKB: blob.size / 1024,
  };
}

export default function FanboxToolPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [maxDimension, setMaxDimension] = useState(2048);
  const [maxSizeMB, setMaxSizeMB] = useState(10);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).filter((f) =>
      IMAGE_EXTENSIONS.includes(extensionOf(f.name))
    );
    setFiles(selected);
    setError(null);
  };

  const handleConvert = async () => {
    if (files.length === 0) return;
    setProcessing(true);
    setError(null);
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);

    const ratio = PRESETS.find((p) => p.id === presetId)?.ratio ?? null;
    const output: ResultItem[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const item = await processFile(files[i], ratio, maxDimension, maxSizeMB, i);
        output.push(item);
        setResults([...output]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "変換中にエラーが発生しました");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold mb-2">FANBOX画像リサイズツール</h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-8">
        画像をまとめてアップロードすると、指定した比率で中心を切り抜き、サイズを揃えて圧縮します。処理はすべてブラウザ内で行われ、画像はサーバーに送信されません。
      </p>

      <div className="flex flex-col gap-6">
        <div>
          <label className="block text-sm font-medium mb-2">画像を選択（複数可）</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-background file:text-sm"
          />
          {files.length > 0 && (
            <p className="mt-1 text-sm text-zinc-500">{files.length}枚選択中</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">切り抜き比率</label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setPresetId(preset.id)}
                className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                  presetId === preset.id
                    ? "bg-foreground text-background border-foreground"
                    : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              長辺の最大ピクセル数: {maxDimension}px
            </label>
            <input
              type="range"
              min={512}
              max={4096}
              step={128}
              value={maxDimension}
              onChange={(e) => setMaxDimension(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              最大ファイルサイズ: {maxSizeMB}MB
            </label>
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
        </div>

        <button
          type="button"
          onClick={handleConvert}
          disabled={files.length === 0 || processing}
          className="rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:opacity-40"
        >
          {processing ? "変換中…" : "変換する"}
        </button>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {results.length > 0 && (
          <div>
            <h2 className="text-lg font-medium mb-4">結果（{results.length}枚）</h2>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {results.map((r) => (
                <li key={r.key} className="flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない */}
                  <img
                    src={r.url}
                    alt={r.fileName}
                    className="w-full aspect-square object-cover rounded-lg border border-zinc-200 dark:border-zinc-800"
                  />
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
    </main>
  );
}
