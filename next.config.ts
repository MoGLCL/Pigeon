import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  images: {
    localPatterns: [
      { pathname: "/api/uploads/logo" },
      { pathname: "/brand/**" },
    ],
  },
};

export default nextConfig;
