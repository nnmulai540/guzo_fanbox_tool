import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // .mdx / .md をpage/importとして扱えるようにする
  pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
};

const withMDX = createMDX({
  options: {
    // Turbopackはプラグインをシリアライズ可能な形（文字列指定）でしか渡せない
    remarkPlugins: ["remark-gfm"],
  },
});

export default withMDX(nextConfig);
