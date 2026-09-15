import type { MDXComponents } from "mdx/types";

// MDXファイル全体に適用するコンポーネント。今は素通しで、必要になったら見出しや画像の見た目をここで調整する
const components: MDXComponents = {};

export function useMDXComponents(): MDXComponents {
  return components;
}
