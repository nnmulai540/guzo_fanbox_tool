"use client";

import { useState } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import type { ImageItem } from "./imageProcessing";

type Props = {
  item: ImageItem;
  ratio: number;
  onClose: () => void;
  onSave: (crop: Point, zoom: number, croppedAreaPixels: Area | null) => void;
};

export default function CropEditorModal({ item, ratio, onClose, onSave }: Props) {
  const [crop, setCrop] = useState<Point>(item.crop);
  const [zoom, setZoom] = useState(item.zoom);
  const [pendingArea, setPendingArea] = useState<Area | null>(item.croppedAreaPixels);
  // 「未編集なら中心トリミングにフォールバックさせる」ため、実際に操作したかどうかを別途追跡する
  // （onCropCompleteは操作していなくても内部再計算で発火する可能性があるため、pendingAreaの有無だけに頼らない）
  const [dirty, setDirty] = useState(item.croppedAreaPixels !== null);

  const handleCropChange = (next: Point) => {
    setCrop(next);
    setDirty(true);
  };

  const handleZoomChange = (next: number) => {
    setZoom(next);
    setDirty(true);
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPendingArea(null);
    setDirty(false);
  };

  const handleConfirm = () => {
    onSave(crop, zoom, dirty ? pendingArea : null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-background p-4 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium">トリミング位置を調整</h3>
        <div className="relative w-full h-[360px] bg-zinc-900 rounded-lg overflow-hidden">
          <Cropper
            image={item.previewUrl}
            crop={crop}
            zoom={zoom}
            aspect={ratio}
            objectFit="cover"
            onCropChange={handleCropChange}
            onZoomChange={handleZoomChange}
            onCropComplete={(_percentArea, croppedAreaPixels) => setPendingArea(croppedAreaPixels)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">ズーム</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:border-zinc-400"
          >
            リセット
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:border-zinc-400"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              確定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
