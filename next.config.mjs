/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Serve uploaded files from /uploads
  async rewrites() {
    return [];
  },
};

export default nextConfig;
