import Link from "next/link";
import { getAllPosts } from "@/lib/posts";

export const metadata = {
  title: "ブログ一覧",
};

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold mb-8">ブログ</h1>
      <ul className="flex flex-col gap-6">
        {posts.map(({ slug, metadata }) => (
          <li key={slug}>
            <Link href={`/blog/${slug}`} className="block group">
              <p className="text-sm text-zinc-500">{metadata.date}</p>
              <h2 className="text-lg font-medium group-hover:underline">
                {metadata.title}
              </h2>
              {metadata.excerpt && (
                <p className="text-zinc-600 dark:text-zinc-400">{metadata.excerpt}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
