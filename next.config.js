/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverActions: {},
    nodeMiddleware: true,
  },
  images: {
    domains: ['avatar.vercel.sh'],
  },
  // Configure middleware to run in Node.js runtime
  middleware: {
    unstable_allowDynamicGlobs: ['app/(auth)/**/*'],
    unstable_excludeFiles: ['api/public/**/*'],
  },
};
