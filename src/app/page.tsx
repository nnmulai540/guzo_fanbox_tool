import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-32 text-center">
      <h1 className="text-3xl font-semibold">guzotool</h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        ここにひとこと自己紹介やコンセプトを書く。
      </p>
      <div className="flex gap-4">
        <Link
          href="/blog"
          className="rounded-full bg-foreground px-6 py-3 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          ブログを見る
        </Link>
        <Link
          href="/fanbox"
          className="rounded-full border border-zinc-300 dark:border-zinc-700 px-6 py-3 transition-colors hover:border-zinc-400"
        >
          画像リサイズツール
        </Link>
        <Link
          href="/articles"
          className="rounded-full border border-zinc-300 dark:border-zinc-700 px-6 py-3 transition-colors hover:border-zinc-400"
        >
          記事を書く
        </Link>
      </div>
    </main>
  );
}
