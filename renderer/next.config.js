/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  // Electron uses static export
  output: 'export',
  distDir: '../dist/renderer',
  trailingSlash: true,
  images: { unoptimized: true },

  webpack: (config) => {
    // Allow importing from shared/ folder outside renderer/
    config.resolve.alias['@shared'] = path.resolve(__dirname, '../shared');
    return config;
  },
};

module.exports = nextConfig;
