import { get, set, del, values, createStore } from "idb-keyval";
import type { Article, StoredImage } from "./types";

// 記事と画像で別々のIndexedDBを使う。
// createStore(dbName, storeName)を同一dbNameで2回呼んでも2つ目のstoreNameは
// 作成されない（onupgradeneededが最初の1回しか走らない）ため、DB自体を分けている。
const articleStore = createStore("vtuber-blog-articles", "articles");
const imageStore = createStore("vtuber-blog-images", "images");

export function isStorageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export function createBlankArticle(): Article {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "",
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveArticle(article: Article): Promise<void> {
  await set(article.id, article, articleStore);
}

export async function loadArticle(id: string): Promise<Article | null> {
  const article = await get<Article>(id, articleStore);
  return article ?? null;
}

export async function listArticles(): Promise<Article[]> {
  const articles = await values<Article>(articleStore);
  return articles.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteArticle(id: string): Promise<void> {
  const article = await loadArticle(id);
  if (article) {
    const imageIds = article.blocks.filter((b) => b.type === "image").map((b) => b.imageId);
    if (article.headerImageId) imageIds.push(article.headerImageId);
    await Promise.all(imageIds.map((imageId) => deleteImage(imageId)));
  }
  await del(id, articleStore);
}

export async function saveImage(id: string, image: StoredImage): Promise<void> {
  await set(id, image, imageStore);
}

export async function loadImage(id: string): Promise<StoredImage | null> {
  const image = await get<StoredImage>(id, imageStore);
  return image ?? null;
}

export async function deleteImage(id: string): Promise<void> {
  await del(id, imageStore);
}
