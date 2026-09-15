export type Area = { x: number; y: number; width: number; height: number };

export type FitMode = "cover" | "contain"; // 切り抜く / 画像全体を残して余白を追加する

export type PadBackground =
  | { kind: "white" | "black" | "auto" | "blur" }
  | { kind: "custom"; color: string };

export type OutputPreset = {
  id: string;
  label: string;
  ratio: number | null; // width / height。nullなら切り抜きなし
  fixedSize?: { width: number; height: number };
};

export const PRESETS: OutputPreset[] = [
  { id: "original", label: "元の比率のまま", ratio: null },
  { id: "square", label: "正方形 (1:1)", ratio: 1 },
  { id: "portrait", label: "縦長 (4:5)", ratio: 4 / 5 },
  { id: "landscape", label: "横長 (16:9)", ratio: 16 / 9 },
  {
    id: "fanbox-cover",
    label: "FANBOXカバー (1200×630px)",
    ratio: 1200 / 630,
    fixedSize: { width: 1200, height: 630 },
  },
];

export function effectiveRatio(preset: OutputPreset): number | null {
  return preset.fixedSize ? preset.fixedSize.width / preset.fixedSize.height : preset.ratio;
}

export type OutputSettings = {
  preset: OutputPreset;
  mode: FitMode;
  background: PadBackground;
  maxDimension: number;
  maxSizeMB: number;
};

export type ImageItem = {
  id: string;
  file: File;
  previewUrl: string;
  crop: { x: number; y: number };
  zoom: number;
  croppedAreaPixels: Area | null; // null = 未編集（中心トリミングにフォールバック）
};

export type ResultItem = {
  key: string;
  fileName: string;
  originalPreviewUrl: string;
  url: string;
  blob: Blob;
  width: number;
  height: number;
  sizeKB: number;
};

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

export function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

// 拡張子から出力フォーマットを決める。JPEG/WebPは品質調整で圧縮し、PNG/GIFはPNGとしてそのまま書き出す
export function outputFormatFor(ext: string): { mime: string; outExt: string; supportsQuality: boolean } {
  if (ext === "jpg" || ext === "jpeg") return { mime: "image/jpeg", outExt: "jpg", supportsQuality: true };
  if (ext === "webp") return { mime: "image/webp", outExt: "webp", supportsQuality: true };
  return { mime: "image/png", outExt: "png", supportsQuality: false };
}

export function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像の書き出しに失敗しました"))),
      mime,
      quality
    );
  });
}

const MIN_QUALITY = 0.1;
const START_QUALITY = 0.92; // まずこの品質で書き出し、上限以下ならそのまま採用する（過剰圧縮を避ける）
const QUALITY_SEARCH_STEPS = 6; // 二分探索の反復回数。品質の精度は概ね (START_QUALITY-MIN_QUALITY)/2^6 ≒ 1%刻み

// サイズ上限に収まる範囲でできるだけ高い品質を自動的に探して書き出す（JPEG/WebPのみ。PNG等は無圧縮のまま）
export async function encodeUnderSizeLimit(
  canvas: HTMLCanvasElement,
  mime: string,
  supportsQuality: boolean,
  maxBytes: number
): Promise<Blob> {
  if (!supportsQuality) {
    return canvasToBlob(canvas, mime);
  }

  const highQualityBlob = await canvasToBlob(canvas, mime, START_QUALITY);
  if (highQualityBlob.size <= maxBytes) return highQualityBlob; // 既に上限以下なら不要な圧縮はしない

  // 上限に収まる最大の品質を二分探索で探す
  let lo = MIN_QUALITY;
  let hi = START_QUALITY;
  let best: Blob | null = null;
  for (let i = 0; i < QUALITY_SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const candidate = await canvasToBlob(canvas, mime, mid);
    if (candidate.size <= maxBytes) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best ?? (await canvasToBlob(canvas, mime, MIN_QUALITY));
}

// 指定した比率にあわせて中心から切り抜く範囲を求める（未編集画像の既定挙動）
export function centerCropRect(width: number, height: number, ratio: number | null): Area {
  if (ratio === null) {
    return { x: 0, y: 0, width, height };
  }
  const sourceRatio = width / height;
  if (sourceRatio > ratio) {
    const h = height;
    const w = Math.round(h * ratio);
    return { x: Math.round((width - w) / 2), y: 0, width: w, height: h };
  }
  const w = width;
  const h = Math.round(w / ratio);
  return { x: 0, y: Math.round((height - h) / 2), width: w, height: h };
}

// customArea（ユーザーが編集した範囲）があればそれを、なければ中心トリミングを返す
export function resolveCropArea(
  bitmapW: number,
  bitmapH: number,
  ratio: number | null,
  customArea: Area | null
): Area {
  return customArea ?? centerCropRect(bitmapW, bitmapH, ratio);
}

// 切り抜きモードの出力サイズ。fixedSizeが最優先、なければ長辺をmaxDimensionでクランプ
export function computeCoverOutputSize(
  cropArea: Area,
  preset: OutputPreset,
  maxDimension: number
): { width: number; height: number } {
  if (preset.fixedSize) return preset.fixedSize;
  const longestSide = Math.max(cropArea.width, cropArea.height);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
  return {
    width: Math.max(1, Math.round(cropArea.width * scale)),
    height: Math.max(1, Math.round(cropArea.height * scale)),
  };
}

// 余白追加モードのフレームサイズ。fixedSizeが最優先、なければ比率とmaxDimensionから算出
export function computeContainFrameSize(
  bitmapW: number,
  bitmapH: number,
  preset: OutputPreset,
  maxDimension: number
): { width: number; height: number } {
  if (preset.fixedSize) return preset.fixedSize;
  const ratio = effectiveRatio(preset) ?? bitmapW / bitmapH;
  let frameW: number;
  let frameH: number;
  if (ratio >= 1) {
    frameW = maxDimension;
    frameH = Math.max(1, Math.round(maxDimension / ratio));
  } else {
    frameW = Math.max(1, Math.round(maxDimension * ratio));
    frameH = maxDimension;
  }
  // 元画像より大きく拡大しないよう、コンテンツの拡大率が1を超える場合はフレームごと縮小する
  const contentScale = Math.min(frameW / bitmapW, frameH / bitmapH);
  if (contentScale > 1) {
    frameW = Math.max(1, Math.round(frameW / contentScale));
    frameH = Math.max(1, Math.round(frameH / contentScale));
  }
  return { width: frameW, height: frameH };
}

// 画像を16x16に縮小して平均RGBを取得する
export async function averageColor(bitmap: ImageBitmap): Promise<string> {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#ffffff";
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let r = 0;
  let g = 0;
  let b = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  cropArea: Area,
  dw: number,
  dh: number
): void {
  ctx.drawImage(bitmap, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, dw, dh);
}

export function drawContainWithBackground(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  frameW: number,
  frameH: number,
  background: PadBackground,
  precomputedAvgColor?: string
): void {
  ctx.imageSmoothingQuality = "high";

  if (background.kind === "white" || background.kind === "black" || background.kind === "custom") {
    ctx.fillStyle = background.kind === "custom" ? background.color : background.kind;
    ctx.fillRect(0, 0, frameW, frameH);
  } else if (background.kind === "auto") {
    ctx.fillStyle = precomputedAvgColor ?? "#ffffff";
    ctx.fillRect(0, 0, frameW, frameH);
  } else if (background.kind === "blur") {
    const coverArea = centerCropRect(bitmap.width, bitmap.height, frameW / frameH);
    const blurRadius = Math.min(60, Math.max(12, Math.round(Math.max(frameW, frameH) * 0.06)));
    // フチのにじみ（透明→黒ずみ）を防ぐため、ぼかし半径ぶん一回り大きく描画する
    const overscan = blurRadius * 2;
    ctx.filter = `blur(${blurRadius}px)`;
    ctx.drawImage(
      bitmap,
      coverArea.x,
      coverArea.y,
      coverArea.width,
      coverArea.height,
      -overscan,
      -overscan,
      frameW + overscan * 2,
      frameH + overscan * 2
    );
    ctx.filter = "none";
  }

  const s = Math.min(frameW / bitmap.width, frameH / bitmap.height);
  const contentW = Math.round(bitmap.width * s);
  const contentH = Math.round(bitmap.height * s);
  const dx = Math.round((frameW - contentW) / 2);
  const dy = Math.round((frameH - contentH) / 2);
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, dx, dy, contentW, contentH);
}

export async function processImageItem(
  item: ImageItem,
  settings: OutputSettings,
  index: number
): Promise<ResultItem> {
  const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
  const ratio = effectiveRatio(settings.preset);
  const canFrame = settings.mode === "contain" && ratio !== null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvasの初期化に失敗しました");

  let dw: number;
  let dh: number;

  if (canFrame) {
    const frame = computeContainFrameSize(bitmap.width, bitmap.height, settings.preset, settings.maxDimension);
    dw = frame.width;
    dh = frame.height;
    canvas.width = dw;
    canvas.height = dh;
    const avgColor = settings.background.kind === "auto" ? await averageColor(bitmap) : undefined;
    drawContainWithBackground(ctx, bitmap, dw, dh, settings.background, avgColor);
  } else {
    const cropArea = resolveCropArea(bitmap.width, bitmap.height, ratio, item.croppedAreaPixels);
    const size = computeCoverOutputSize(cropArea, settings.preset, settings.maxDimension);
    dw = size.width;
    dh = size.height;
    canvas.width = dw;
    canvas.height = dh;
    drawCover(ctx, bitmap, cropArea, dw, dh);
  }

  bitmap.close();

  const ext = extensionOf(item.file.name);
  const { mime, outExt, supportsQuality } = outputFormatFor(ext);
  const blob = await encodeUnderSizeLimit(canvas, mime, supportsQuality, settings.maxSizeMB * 1024 * 1024);

  const baseName = item.file.name.replace(/\.[^.]+$/, "");
  const fileName = `${String(index + 1).padStart(2, "0")}_${baseName}.${outExt}`;

  return {
    key: `${item.id}-${fileName}`,
    fileName,
    originalPreviewUrl: item.previewUrl,
    url: URL.createObjectURL(blob),
    blob,
    width: dw,
    height: dh,
    sizeKB: blob.size / 1024,
  };
}
