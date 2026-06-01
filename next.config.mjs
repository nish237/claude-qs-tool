/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Prevent canvas native module issues with pdfjs
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
