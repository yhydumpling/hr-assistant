import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["pg", "mammoth", "unpdf"]
};

export default config;
