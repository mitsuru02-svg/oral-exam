/**
 * Cloudflare Worker — Anthropic API プロキシ
 *
 * セットアップ手順:
 * 1. https://workers.cloudflare.com でアカウント作成（無料）
 * 2. 「Create Worker」→ このコードを貼り付けて Deploy
 * 3. Settings → Variables → 「ANTHROPIC_API_KEY」に APIキーを登録
 * 4. WorkerのURL（例: https://oral-exam.xxxxx.workers.dev）を
 *    index.html の CONFIG.API_ENDPOINT に貼る
 */

export default {
  async fetch(request, env) {

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // APIキー確認
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return jsonError(500, 'ANTHROPIC_API_KEY が Worker に設定されていません');
    }

    // リクエストボディをそのままAnthropicに転送
    let body;
    try {
      body = await request.text();
    } catch {
      return jsonError(400, 'リクエストの読み込みに失敗しました');
    }

    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body,
      });

      const data = await resp.text();
      return new Response(data, {
        status: resp.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });

    } catch (e) {
      return jsonError(502, `Anthropic API への接続に失敗: ${e.message}`);
    }
  }
};

function jsonError(status, message) {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}
