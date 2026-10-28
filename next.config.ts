import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pg", "mammoth", "unpdf"]
};

export default config;
