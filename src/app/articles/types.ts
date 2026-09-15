export type ArticleBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; imageId: string };

export type Article = {
  id: string;
  title: string;
  headerImageId?: string; // 記事ヘッダー（カバー画像）。本文のblocksとは別枠で1枚だけ持つ
  blocks: ArticleBlock[];
  createdAt: number;
  updatedAt: number;
};

export type StoredImage = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  sizeKB: number;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";
