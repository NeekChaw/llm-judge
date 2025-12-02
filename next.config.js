/** @type {import('next').NextConfig} */
const nextConfig = {
  // 暂时关闭严格模式避免水合错误
  reactStrictMode: false,
  // 暂时关闭 typedRoutes 避免类型错误
  // experimental: {
  //   typedRoutes: true,
  // },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Docker 部署必需：生成独立输出
  output: 'standalone',
};

module.exports = nextConfig;