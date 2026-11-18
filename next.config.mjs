import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    const mirrorRewrites = [];

    try {
      const manifestPath = fileURLToPath(new URL('./mirror-manifest.json', import.meta.url));
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const withQuery = [];
        const plain = [];

        for (const page of manifest) {
          if (page.pathname === "/shop") continue;
          const destination = `/mirror/${page.file}`;
          if (page.match) {
            const has = [...new URLSearchParams(page.match).entries()].map(([key, value]) => ({
              type: 'query',
              key,
              value,
            }));
            withQuery.push({ source: page.pathname, has, destination });
          } else {
            plain.push({ source: page.pathname, destination });
          }
        }

        mirrorRewrites.push(...withQuery, ...plain);
      }
    } catch {
      // ignore a missing or malformed mirror manifest
    }

    return {
      beforeFiles: [
        { source: '/', destination: '/index.html' },
        { source: '/customize', destination: '/customize.html' },
        ...mirrorRewrites,
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/jp-ui.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/jp-ui.css",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
