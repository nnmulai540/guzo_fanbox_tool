export type ArticleBlock =
  | { id: string; type: "text"; text: string }
  | { id: string; type: "image"; imageId: string };

export type Article = {
  id: string;
  title: string;
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
