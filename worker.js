/* Cloudflare Workers の入口。
   HTML や画像などの静的ファイルは Cloudflare 側が先に返すので、
   ここに来るのは実質 /api/… だけ。中継の中身は lib/proxy.js にある。 */
import { handleApi } from './lib/proxy.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
      return handleApi(seg, env, request.method, request);
    }
    /* 念のため。通常はここまで来ない */
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
