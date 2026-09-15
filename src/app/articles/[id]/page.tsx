"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ArticlePreview from "../ArticlePreview";
import ImageInsertModal from "../ImageInsertModal";
import { deleteImage, loadArticle, loadImage, saveArticle } from "../storage";
import { moveItem } from "../reorder";
import type { Article, ArticleBlock, SaveStatus } from "../types";

const AUTOSAVE_DELAY_MS = 8000;

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  idle: "保存待ち…",
  saving: "保存中…",
  saved: "保存済み",
  error: "保存に失敗しました",
};

export default function ArticleEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  const articleRef = useRef<Article | null>(null);
  useEffect(() => {
    articleRef.current = article;
  }, [article]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const current = articleRef.current;
    if (!current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus("saving");
    try {
      const toSave: Article = { ...current, updatedAt: Date.now() };
      await saveArticle(toSave);
      articleRef.current = toSave;
      setArticle(toSave);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
  }, []);

  const scheduleAutosave = useCallback(() => {
    setSaveStatus("idle");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flush();
    }, AUTOSAVE_DELAY_MS);
  }, [flush]);

  const updateArticle = useCallback(
    (updater: (prev: Article) => Article) => {
      setArticle((prev) => (prev ? updater(prev) : prev));
      scheduleAutosave();
    },
    [scheduleAutosave]
  );

  // 記事の読み込み
  useEffect(() => {
    let cancelled = false;
    // idが変わるたびに前の記事の表示状態をリセットする（読み込み自体は下のthenで非同期に行う）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setNotFound(false);
    loadArticle(id)
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          setArticle(loaded);
          setSaveStatus("saved");
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // タブを閉じる・切り替える直前に確実に保存する
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const handlePageHide = () => flush();
    const handleBeforeUnload = () => flush();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flush]);

  // このエディタ画面を離れるとき（別記事に遷移する等）にも保存する
  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  // 記事が参照する画像のBlob URLを読み込む。記事(id)や画像構成が変わったら作り直す
  const imageIds = article ? article.blocks.filter((b): b is Extract<ArticleBlock, { type: "image" }> => b.type === "image").map((b) => b.imageId) : [];
  const imageIdsKey = imageIds.join(",");

  useEffect(() => {
    if (!article) return;
    let cancelled = false;
    const newUrls = new Map<string, string>();
    (async () => {
      for (const imageId of imageIds) {
        const stored = await loadImage(imageId);
        if (stored) newUrls.set(imageId, URL.createObjectURL(stored.blob));
      }
      if (!cancelled) setImageUrls(newUrls);
    })();
    return () => {
      cancelled = true;
      newUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- imageIdsKeyの変化だけを見れば十分
  }, [imageIdsKey, id]);

  const setTitle = (title: string) => updateArticle((a) => ({ ...a, title }));

  const addTextBlock = () =>
    updateArticle((a) => ({ ...a, blocks: [...a.blocks, { id: crypto.randomUUID(), type: "text", text: "" }] }));

  const updateTextBlock = (blockId: string, text: string) =>
    updateArticle((a) => ({
      ...a,
      blocks: a.blocks.map((b) => (b.id === blockId && b.type === "text" ? { ...b, text } : b)),
    }));

  const insertImageBlocks = (imageIdsToInsert: string[]) =>
    updateArticle((a) => ({
      ...a,
      blocks: [...a.blocks, ...imageIdsToInsert.map((imageId) => ({ id: crypto.randomUUID(), type: "image" as const, imageId }))],
    }));

  const removeBlock = (blockId: string) => {
    const target = article?.blocks.find((b) => b.id === blockId);
    updateArticle((a) => ({ ...a, blocks: a.blocks.filter((b) => b.id !== blockId) }));
    // 記事stateから取り除いたあとに削除する（保存中のオートセーブが古い参照を含まないようにするため）
    if (target?.type === "image") {
      deleteImage(target.imageId).catch(() => {});
    }
  };

  const moveBlock = (blockId: string, to: "up" | "down" | "top" | "bottom") => {
    updateArticle((a) => {
      const from = a.blocks.findIndex((b) => b.id === blockId);
      if (from === -1) return a;
      const target = to === "up" ? from - 1 : to === "down" ? from + 1 : to === "top" ? 0 : a.blocks.length - 1;
      return { ...a, blocks: moveItem(a.blocks, from, target) };
    });
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-zinc-500">読み込み中…</p>
      </main>
    );
  }

  if (notFound || !article) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-zinc-500 mb-4">この下書きは見つかりませんでした。</p>
        <Link href="/articles" className="text-sm underline">
          下書き一覧に戻る
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between gap-4 mb-6">
        <Link href="/articles" className="text-sm text-zinc-500 hover:underline">
          ← 下書き一覧
        </Link>
        <p className={`text-xs ${saveStatus === "error" ? "text-red-500" : "text-zinc-500"}`}>
          {SAVE_STATUS_LABEL[saveStatus]}
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setViewMode("edit")}
          className={`rounded-full px-4 py-2 text-sm border transition-colors ${
            viewMode === "edit"
              ? "bg-foreground text-background border-foreground"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
          }`}
        >
          編集
        </button>
        <button
          type="button"
          onClick={() => setViewMode("preview")}
          className={`rounded-full px-4 py-2 text-sm border transition-colors ${
            viewMode === "preview"
              ? "bg-foreground text-background border-foreground"
              : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400"
          }`}
        >
          プレビュー
        </button>
        <button
          type="button"
          onClick={flush}
          className="ml-auto rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:border-zinc-400"
        >
          下書きを保存
        </button>
      </div>

      {viewMode === "preview" ? (
        <ArticlePreview title={article.title} blocks={article.blocks} imageUrls={imageUrls} />
      ) : (
        <div className="flex flex-col gap-6">
          <input
            type="text"
            value={article.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="記事タイトル"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 text-lg font-medium"
          />

          <ul className="flex flex-col gap-4">
            {article.blocks.map((block, index) => (
              <li key={block.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                {block.type === "text" ? (
                  <textarea
                    value={block.text}
                    onChange={(e) => updateTextBlock(block.id, e.target.value)}
                    placeholder="本文を書く"
                    rows={4}
                    className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない
                  <img
                    src={imageUrls.get(block.imageId)}
                    alt=""
                    className="max-h-64 w-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
                  />
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveBlock(block.id, "top")}
                    className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                  >
                    先頭へ
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => moveBlock(block.id, "up")}
                    className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    disabled={index === article.blocks.length - 1}
                    onClick={() => moveBlock(block.id, "down")}
                    className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    disabled={index === article.blocks.length - 1}
                    onClick={() => moveBlock(block.id, "bottom")}
                    className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400 disabled:opacity-40"
                  >
                    末尾へ
                  </button>
                  <button
                    type="button"
                    onClick={() => removeBlock(block.id)}
                    className="ml-auto rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-[11px] hover:border-zinc-400"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={addTextBlock}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:border-zinc-400"
            >
              ＋テキストを追加
            </button>
            <button
              type="button"
              onClick={() => setShowImageModal(true)}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:border-zinc-400"
            >
              ＋画像を追加
            </button>
          </div>
        </div>
      )}

      {showImageModal && (
        <ImageInsertModal onClose={() => setShowImageModal(false)} onInsert={insertImageBlocks} />
      )}
    </main>
  );
}
