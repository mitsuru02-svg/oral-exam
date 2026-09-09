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

import { explainImage, imageTime } from './explain.js';

/* 配信されているのが本当に最新かを、画面から確かめるための目印 */
const VERSION = '2026-09-10-3';

const KINDS = new Set(['metar', 'taf', 'station']);

/* 誰でも叩ける踏み台にしないため、通す先をここで絞る */
const JMA_HOST = 'https://www.jma.go.jp/';
const JMA_OK   = /^bosai\/[A-Za-z0-9_\-./]+\.json$/;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status,
  headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
});

/* seg は /api/ より後ろを / で切ったもの。例 ['metar','RJEC'] */
export async function handleApi(seg, env, method, req) {
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  /* 図に印字された時刻の読み取り。短い問い合わせで費用も小さい */
  if (seg[0] === 'imgtime') {
    if (method !== 'POST') return json({ error: 'POST で送ってください' }, 405);
    let body = null;
    try { body = await req.json(); } catch (e) {
      return json({ error: '送られた内容を読めませんでした' }, 400);
    }
    return imageTime(body, env);
  }

  /* 天気図・衛星画像の解説。画像は送らせず URL だけ受け取る */
  if (seg[0] === 'explain') {
    if (method !== 'POST') return json({ error: '解説は POST で送ってください' }, 405);
    let body = null;
    try { body = await req.json(); } catch (e) {
      return json({ error: '送られた内容を読めませんでした' }, 400);
    }
    return explainImage(body, env);
  }

  if (method && method !== 'GET') return json({ error: 'GET だけ受け付けます' }, 405);

  /* 動作確認用。外へ問い合わせないので AVWX の回数を消費しない。
     トークンが入っているかどうかだけを返す。中身は返さない */
  if (seg[0] === 'health' || seg.length === 0) {
    const t = env && env.AVWX_TOKEN;
    return json({
      ok: true,
      version: VERSION,
      avwx_token: t ? '設定済み' : '未設定',
      anthropic_key: (env && env.ANTHROPIC_API_KEY) ? '設定済み' : '未設定',
      /* 長さだけ。中身は返さない。前後に空白が混ざっていないかの判断用 */
      token_len: typeof t === 'string' ? t.length : null,
      token_trimmed_len: typeof t === 'string' ? t.trim().length : null,
      /* 名前の綴り違いを見つけるため。名前だけで、値は一切返さない */
      env_keys: env ? Object.keys(env).sort() : [],
      time: new Date().toISOString(),
    }, 200);
  }

  /* ── ひまわりの「本当の最新コマ」を教える ──
     気象衛星センターのファイル名は時分だけで日付を含まないため、
     まだ今日のぶんが出ていないコマは昨日の画像がそのまま返る。
     ブラウザからは区別がつかないので、更新日時をここで見て判定する。 */
  if (seg[0] === 'satlatest') {
    const band = String(seg[1] || '').toLowerCase();
    if (!/^b\d{2}$/.test(band)) return json({ error: 'band が不正です' }, 400);
    return satLatest(band);
  }

  /* ── 指定した1コマの更新日時を教える ──
     satlatest は「本当の最新」を探すためのもの。スライドバーで遡って
     見ているコマは、それとは別の時分を指定して読みにいくので、
     その1コマ自体が今日のぶんなのか（＝日付が古い居座りではないか）を
     端末側で判定できるよう、更新日時だけをここで返す。
     HEAD 1回だけなので軽い。判定は端末側（loadMsc）で行う */
  if (seg[0] === 'satcheck') {
    const band = String(seg[1] || '').toLowerCase();
    const hhmm = String(seg[2] || '');
    if (!/^b\d{2}$/.test(band) || !/^\d{4}$/.test(hhmm)) {
      return json({ error: 'band・時刻（4桁）が不正です' }, 400);
    }
    return satCheck(band, hhmm);
  }

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
  const base = `https://avwx.rest/api/${kind}/${icao}?format=json&onfail=cache`;
  return avwxFetch(base, token);
}

/* AVWX への認証の渡し方は資料によって書かれ方が違う。どれが通るか
   決め打ちせず、順に試す。全部だめなら相手の言い分をそのまま返して、
   何が悪いのかが画面から分かるようにする */
async function avwxFetch(base, token) {
  const t = String(token).trim();
  const attempts = [
    { url: base + '&token=' + encodeURIComponent(t), headers: {} },
    { url: base, headers: { Authorization: t } },
    { url: base, headers: { Authorization: 'BEARER ' + t } },
    { url: base, headers: { Authorization: 'Bearer ' + t } },
  ];
  let last = null;
  for (const a of attempts) {
    let r;
    try {
      /* METAR は毎時更新なので2分ほど持たせる。無料枠（1日4,000回）を守る意味もある */
      r = await fetch(a.url, { headers: a.headers, cf: { cacheTtl: 120, cacheEverything: true } });
    } catch (e) {
      last = { status: 502, body: '取得先に届きませんでした：' + ((e && e.message) || e) };
      continue;
    }
    const body = await r.text();
    if (r.ok) {
      return new Response(body, {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' },
      });
    }
    last = { status: r.status, body };
  }
  /* 相手が返した本文を、そのまま読める形で載せる */
  let detail = String((last && last.body) || '').slice(0, 300);
  try {
    const j = JSON.parse(last.body);
    detail = j.error || j.detail || j.message || detail;
  } catch (e) {}
  return json({ error: 'AVWX が拒否しました：' + detail, status: last ? last.status : 0 },
    last && last.status ? last.status : 502);
}

const SAT_BASE = 'https://www.data.jma.go.jp/mscweb/data/himawari/img/jpn/jpn_';
const p2 = n => String(n).padStart(2, '0');

async function satLatest(band) {
  const now = new Date();
  now.setUTCSeconds(0, 0);
  now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 10) * 10);

  /* いまから10分刻みで遡り、更新日時が新しいコマを最初に見つけた時点で採る。
     昨日の画像が居座っているコマは更新日時が1日前になるので弾ける */
  for (let k = 0; k < 18; k++) {
    const t = new Date(now.getTime() - k * 600000);
    const hh = p2(t.getUTCHours()) + p2(t.getUTCMinutes());
    let r;
    try {
      r = await fetch(SAT_BASE + band + '_' + hh + '.jpg',
        { method: 'HEAD', cf: { cacheTtl: 60, cacheEverything: true } });
    } catch (e) { continue; }
    if (!r.ok) continue;
    const lm = r.headers.get('last-modified');
    if (!lm) continue;
    const min = (Date.now() - Date.parse(lm)) / 60000;
    if (min >= -10 && min < 180) {          /* 3時間以内なら今日のもの */
      return new Response(JSON.stringify({ hhmm: hh, minutes_old: Math.round(min) }), {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json; charset=utf-8',
                   'cache-control': 'public, max-age=120' },
      });
    }
  }
  return json({ hhmm: '', error: '最新のコマを特定できませんでした' }, 200);
}

/* 指定した1コマ（band + hhmm）の更新日時だけを返す。今日のぶんかどうかの
   判定は端末側で行う（端末はその時分がいつを指すつもりの時刻か、つまり
   何日の何時何分を見ようとしているかを知っているので、そちらで比べる方が
   簡単。ここでは更新日時を伝える窓口だけを持つ） */
async function satCheck(band, hhmm) {
  let r;
  try {
    r = await fetch(SAT_BASE + band + '_' + hhmm + '.jpg',
      { method: 'HEAD', cf: { cacheTtl: 60, cacheEverything: true } });
  } catch (e) {
    return json({ ok: false, error: '取得先に届きませんでした：' + ((e && e.message) || e) }, 200);
  }
  if (!r.ok) return json({ ok: false }, 200);
  return json({ ok: true, lastModified: r.headers.get('last-modified') || null }, 200);
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
