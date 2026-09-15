"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBlankArticle, deleteArticle, isStorageAvailable, listArticles, saveArticle } from "./storage";
import type { Article } from "./types";

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} 更新`;
}

export default function ArticleListPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isStorageAvailable()) {
      // ブラウザ機能の同期チェックなので、マウント直後に同期的に状態を確定させる
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageAvailable(false);
      setLoading(false);
      return;
    }
    listArticles()
      .then(setArticles)
      .catch(() => setError("下書き一覧の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const article = createBlankArticle();
    try {
      await saveArticle(article);
      router.push(`/articles/${article.id}`);
    } catch {
      setError("新規記事の作成に失敗しました（ブラウザの保存領域をご確認ください）");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteArticle(id);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("削除に失敗しました");
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold mb-2">記事の下書き</h1>
      <p className="text-zinc-600 dark:text-zinc-400 mb-8">
        FANBOXに投稿する記事の下書きをブラウザ内に保存します。作成した下書きを見ながらFANBOX側へ手動で投稿してください（自動投稿はできません）。
      </p>

      {!storageAvailable && (
        <p className="text-sm text-red-500 mb-6">
          このブラウザまたは設定（プライベートブラウジング等）では下書き機能を利用できません。
        </p>
      )}

      {storageAvailable && (
        <button
          type="button"
          onClick={handleCreate}
          className="mb-8 rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          新規記事を作成
        </button>
      )}

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-zinc-500">読み込み中…</p>
      ) : (
        storageAvailable &&
        (articles.length === 0 ? (
          <p className="text-sm text-zinc-500">まだ下書きがありません。</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {articles.map((article) => (
              <li
                key={article.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/articles/${article.id}`)}
                  className="text-left flex-1 min-w-0"
                >
                  <p className="font-medium truncate">{article.title.trim() || "無題の下書き"}</p>
                  <p className="text-xs text-zinc-500">{formatDate(article.updatedAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(article.id)}
                  className="shrink-0 rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs hover:border-zinc-400"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        ))
      )}
    </main>
  );
}
