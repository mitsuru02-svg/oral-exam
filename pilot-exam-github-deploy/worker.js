/**
 * Cloudflare Worker — Anthropic API プロキシ ＋ 端末間同期（KV）
 *
 * セットアップ手順:
 * 1. https://workers.cloudflare.com でアカウント作成（無料）
 * 2. 「Create Worker」→ このコードを貼り付けて Deploy
 * 3. Settings → Variables → 「ANTHROPIC_API_KEY」に APIキーを登録
 * 4. WorkerのURL（例: https://oral-exam.xxxxx.workers.dev）を
 *    index.html の CONFIG.API_ENDPOINT に貼る
 *
 * 端末間同期（正解数・苦手問題・チェック）を使う場合は追加で:
 * 5. 左メニュー「Storage & Databases」→「KV」→「Create a namespace」
 *    （名前は任意。例: oral-exam-sync）
 * 6. このWorkerの Settings → Variables →「KV Namespace Bindings」で
 *    変数名を「SYNC_KV」として、5で作ったネームスペースを紐付ける
 * 7. Save & Deploy。これで jitchi_qa_practice.html の同期ID機能が使えます。
 *    （SYNC_KVが未設定の場合、AI採点機能はそのまま動作し、同期機能だけ
 *    エラーメッセージを返します）
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // ── 端末間同期：登録済みID一覧（/sync-list）──
    if (url.pathname === '/sync-list') {
      return handleSyncList(request, env);
    }

    // ── 端末間同期エンドポイント（/sync/<ID>）──
    if (url.pathname.startsWith('/sync/')) {
      return handleSync(request, env, url);
    }

    // ── 既存：AI採点プロキシ（ルートへのPOST）──
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

// ══════════════════════════════════════════════════════════════
// 学習進捗の端末間同期（Cloudflare KV使用）
// 同じ同期IDでGET/PUTすると、正解数・苦手問題・チェックした問題を
// 複数端末間で引き継げる。
//
// 苦手問題／チェックは「問題ごとの最終更新時刻つき状態」（syncMeta）で
// 管理し、マージは問題ごとに「タイムスタンプが新しい方を採用」する。
// （以前は配列の単純な和集合でマージしていたが、それだと一度サーバーに
// 「不正解」として記録された問題は、後で正解しても和集合の性質上
// 二度と消えず復活してしまう欠陥があった。タイムスタンプ方式ならこの
// 問題は起きない。）
// ══════════════════════════════════════════════════════════════
async function handleSync(request, env, url) {
  const id = decodeURIComponent(url.pathname.replace('/sync/', '')).trim();
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    return jsonError(400, '同期IDは英数字・ハイフン・アンダースコアで64文字以内にしてください');
  }
  if (!env.SYNC_KV) {
    return jsonError(500, 'SYNC_KV（KVネームスペース）がWorkerにバインドされていません。Worker設定を確認してください。');
  }
  const key = 'sync:' + id;

  if (request.method === 'GET') {
    const raw = await env.SYNC_KV.get(key);
    const data = raw ? JSON.parse(raw) : emptyState();
    return jsonResponse({
      totalCorrect:  data.totalCorrect  || 0,
      totalAnswered: data.totalAnswered || 0,
      syncMeta: toMeta(data),
      updatedAt: data.updatedAt || 0,
    });
  }

  if (request.method === 'PUT' || request.method === 'POST') {
    let incoming;
    try {
      incoming = JSON.parse(await request.text());
    } catch {
      return jsonError(400, '不正なJSONです');
    }
    const raw = await env.SYNC_KV.get(key);
    const existing = raw ? JSON.parse(raw) : emptyState();
    const merged = mergeState(existing, incoming);
    await env.SYNC_KV.put(key, JSON.stringify(merged));
    return jsonResponse(merged);
  }

  // 同期IDの削除。取り消せないので、画面側では必ず確認をとってから呼ぶこと。
  if (request.method === 'DELETE') {
    const raw = await env.SYNC_KV.get(key);
    if (!raw) return jsonError(404, 'そのIDは登録されていません');
    await env.SYNC_KV.delete(key);
    return jsonResponse({ deleted: true, id });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

// 登録済みの同期ID一覧（正解数などのサマリのみ、更新が新しい順）
async function handleSyncList(request, env) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  if (!env.SYNC_KV) {
    return jsonError(500, 'SYNC_KV（KVネームスペース）がWorkerにバインドされていません。Worker設定を確認してください。');
  }
  // KV の list() は1回で最大1000件しか返さないため、カーソルを辿って全件を集める
  const ids = [];
  let cursor;
  do {
    const list = await env.SYNC_KV.list({ prefix: 'sync:', cursor });
    for (const key of list.keys) {
      const raw = await env.SYNC_KV.get(key.name);
      if (!raw) continue;
      let data;
      try { data = JSON.parse(raw); } catch { continue; }
      const meta = toMeta(data);
      const values = Object.values(meta);
      ids.push({
        id: key.name.slice('sync:'.length),
        totalCorrect:  data.totalCorrect  || 0,
        totalAnswered: data.totalAnswered || 0,
        wrongCount:    values.filter(m => m.verdict && m.verdict !== '正解').length,
        checkedCount:  values.filter(m => m.checked).length,
        updatedAt:     data.updatedAt || 0,
      });
    }
    cursor = list.list_complete ? null : list.cursor;
  } while (cursor);
  ids.sort((a, b) => b.updatedAt - a.updatedAt);
  return jsonResponse({ ids, total: ids.length });
}

function emptyState() {
  return { totalCorrect: 0, totalAnswered: 0, syncMeta: {}, updatedAt: 0 };
}

// 旧形式からの後方互換アップグレード：
// ・さらに旧: wrongIndices/checkedIndices の単純配列（問題ごとの時刻が無いので
//   レコード全体の updatedAt を仮のタイムスタンプとして割り当てる）
// ・旧: syncMeta の各エントリが {wrong:真偽値, checked, t}（正解／部分正解を
//   区別できない世代）→ {verdict:'正解'|'不正解', checked, t} に変換
// 以後はすべて {verdict:'正解'|'部分正解'|'不正解'|'スキップ', checked, t} 形式。
function normalizeEntry(e) {
  if (!e) return undefined;
  if ('verdict' in e) return e;
  if ('wrong' in e) return { verdict: e.wrong ? '不正解' : '正解', checked: !!e.checked, t: e.t || 0 };
  return undefined;
}

function toMeta(state) {
  if (state.syncMeta) {
    const out = {};
    for (const k of Object.keys(state.syncMeta)) {
      const norm = normalizeEntry(state.syncMeta[k]);
      if (norm) out[k] = norm;
    }
    return out;
  }
  const meta = {};
  const t = state.updatedAt || 0;
  (state.wrongIndices || []).forEach(i => { meta[i] = { verdict: '不正解', checked: false, t }; });
  (state.checkedIndices || []).forEach(i => {
    meta[i] = meta[i] ? { ...meta[i], checked: true } : { verdict: undefined, checked: true, t };
  });
  return meta;
}

function mergeState(a, b) {
  const metaA = toMeta(a), metaB = toMeta(b);
  const merged = {};
  for (const k of new Set([...Object.keys(metaA), ...Object.keys(metaB)])) {
    const ea = metaA[k], eb = metaB[k];
    merged[k] = !ea ? eb : !eb ? ea : ((eb.t || 0) > (ea.t || 0) ? eb : ea);
  }
  return {
    totalCorrect:  Math.max(a.totalCorrect  || 0, b.totalCorrect  || 0),
    totalAnswered: Math.max(a.totalAnswered || 0, b.totalAnswered || 0),
    syncMeta: merged,
    updatedAt: Date.now(),
  };
}

function jsonResponse(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function jsonError(status, message) {
  return new Response(
    JSON.stringify({ error: { message } }),
    { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}
