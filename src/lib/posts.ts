import fs from "fs";
import path from "path";

const POSTS_DIR = path.join(process.cwd(), "src/content/posts");

export type PostMetadata = {
  title: string;
  date: string;
  author: string;
  excerpt?: string;
};

// content/posts/ 内の .mdx ファイル名（拡張子なし）をURLのslugとして使う
export function getPostSlugs(): string[] {
  return fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

export async function getPostMetadata(slug: string): Promise<PostMetadata> {
  const mod = await import(`@/content/posts/${slug}.mdx`);
  return mod.metadata as PostMetadata;
}

export async function getAllPosts(): Promise<
  { slug: string; metadata: PostMetadata }[]
> {
  const slugs = getPostSlugs();
  const posts = await Promise.all(
    slugs.map(async (slug) => ({ slug, metadata: await getPostMetadata(slug) }))
  );

  // 日付の新しい記事から順に並べる
  return posts.sort((a, b) => (a.metadata.date < b.metadata.date ? 1 : -1));
}
