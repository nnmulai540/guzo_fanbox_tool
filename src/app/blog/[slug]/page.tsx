import type { Metadata } from "next";
import { getPostSlugs, getPostMetadata } from "@/lib/posts";

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

// content/posts/ に無いslugは404にする
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const metadata = await getPostMetadata(slug);
  return { title: metadata.title, description: metadata.excerpt };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { default: Post } = await import(`@/content/posts/${slug}.mdx`);
  const metadata = await getPostMetadata(slug);

  return (
    <article className="prose prose-zinc dark:prose-invert mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm text-zinc-500 not-prose">
        {metadata.date} ・ {metadata.author}
      </p>
      <Post />
    </article>
  );
}
