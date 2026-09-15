import type { ArticleBlock } from "./types";

type Props = {
  title: string;
  headerImageUrl?: string;
  blocks: ArticleBlock[];
  imageUrls: Map<string, string>;
};

export default function ArticlePreview({ title, headerImageUrl, blocks, imageUrls }: Props) {
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
      {headerImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない
        <img src={headerImageUrl} alt="" className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800" />
      )}
      <h1 className="text-2xl font-semibold">{title.trim() || "無題の記事"}</h1>
      {blocks.length === 0 && <p className="text-sm text-zinc-500">まだ本文がありません。</p>}
      {blocks.map((block) => {
        if (block.type === "text") {
          if (!block.text.trim()) return null;
          return (
            <p key={block.id} className="whitespace-pre-wrap leading-relaxed">
              {block.text}
            </p>
          );
        }
        const url = imageUrls.get(block.imageId);
        if (!url) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- ブラウザ生成のblob URLなのでnext/imageは使わない
          <img key={block.id} src={url} alt="" className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800" />
        );
      })}
    </article>
  );
}
