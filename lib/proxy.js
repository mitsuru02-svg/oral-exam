/* ══════════════════════════════════════════════════════════════
   AVWX と気象庁への中継（本体）

   なぜ要るか。AVWX はトークンが要るが、そのトークンをページの中に
   書くと、ページを開けた人全員に見えてしまう。ここで中継すれば
   トークンはサーバー側の環境変数にとどまり、端末には一切渡らない。

   窓口
     /api/metar/RJEC          …… METAR
     /api/taf/RJEC            …… TAF
     /api/station/RJEC        …… 空港情報
     /api/jma/bosai/…/x.json  …… 気象庁の JSON をそのまま中継

   Workers（worker.js）からも Pages（functions/）からも、
   同じこの関数を呼ぶ。置き方は DEPLOY.md を参照。
   ══════════════════════════════════════════════════════════════ */

const KINDS = new Set(['metar', 'taf', 'station']);

/* 誰でも叩ける踏み台にしないため、通す先をここで絞る */
const JMA_HOST = 'https://www.jma.go.jp/';
const JMA_OK   = /^bosai\/[A-Za-z0-9_\-./]+\.json$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-max-age': '86400',
};

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
});

/* seg は /api/ より後ろを / で切ったもの。例 ['metar','RJEC'] */
export async function handleApi(seg, env, method) {
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (method && method !== 'GET') return json({ error: 'GET だけ受け付けます' }, 405);

  /* ── 気象庁の JSON をそのまま中継 ── */
  if (seg[0] === 'jma') {
    const path = seg.slice(1).join('/');
    if (!JMA_OK.test(path) || path.includes('..')) {
      return json({ error: '気象庁の bosai 配下の .json だけ中継できます' }, 400);
    }
    return passthrough(JMA_HOST + path, {}, 300);
  }

  /* ── AVWX ── */
  const kind = String(seg[0] || '').toLowerCase();
  const icao = String(seg[1] || '').toUpperCase();
  if (!KINDS.has(kind) || !/^[A-Z0-9]{4}$/.test(icao)) {
    return json({ error: '使えるのは /api/metar|taf|station/<ICAO4桁> です' }, 400);
  }
  const token = env && env.AVWX_TOKEN;
  if (!token) {
    return json({ error: 'サーバーに AVWX_TOKEN が設定されていません' }, 500);
  }
  const url = `https://avwx.rest/api/${kind}/${icao}?format=json&onfail=cache`;
  /* METAR は毎時更新なので2分ほど持たせる。無料枠（1日4,000回）を守る意味もある */
  return passthrough(url, { Authorization: token }, 120);
}

async function passthrough(url, headers, ttl) {
  let r;
  try {
    r = await fetch(url, { headers, cf: { cacheTtl: ttl, cacheEverything: true } });
  } catch (e) {
    return json({ error: '取得先に届きませんでした：' + ((e && e.message) || e) }, 502);
  }
  const body = await r.text();
  return new Response(body, {
    status: r.status,
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${ttl}`,
    },
  });
}
