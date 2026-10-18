import { defineConfig } from 'vite';
const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
export default defineConfig({
  base: './',
  define: {
    __APP_COMMIT__: JSON.stringify(/^[a-f0-9]{40}$/i.test(sha) ? sha : ''),
    __APP_COMMIT_MESSAGE__: JSON.stringify(process.env.VERCEL_GIT_COMMIT_MESSAGE ?? ''),
    __APP_DEPLOYED__: JSON.stringify(process.env.VERCEL === '1'),
  },
});
