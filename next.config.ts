import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.1.132'],
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  // The country-flag API reads .webp files from src/flags at runtime via fs. Ensure those
  // files are traced into the serverless function bundle so flags don't 404 on Vercel.
  outputFileTracingIncludes: {
    "/api/flags/[code]": ["./src/flags/**"],
  },
  // Articles were renamed to Blogs — keep old public links working.
  async redirects() {
    return [
      { source: '/articles', destination: '/blogs', permanent: true },
      { source: '/articles/:articleId', destination: '/blogs/:articleId', permanent: true },
    ];
  },
};

export default nextConfig;
