/* ══════════════════════════════════════════════════════════════
   天気図・衛星画像の解説

   画像そのものはブラウザから送らず、URL だけを受け取って
   サーバー側で取りにいく。API キーは環境変数にとどまり、
   端末にも、ページのソースにも出てこない。

   方針として「飛べる・飛べない」は言わせない。
   図から読み取れる事実と、その意味の説明までにとどめる。
   判断は人がするというページ全体の作りを崩さないため。
   ══════════════════════════════════════════════════════════════ */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* 画像の読み取りに強く、費用も抑えられる。もっと精度を上げたいときは
   claude-opus-5 に変える（そのぶん高くなる） */
const MODEL = 'claude-sonnet-5';

/* 踏み台にされないよう、解説できるのは気象庁の画像だけに絞る */
const IMG_OK = /^https:\/\/(www\.jma\.go\.jp|www\.data\.jma\.go\.jp)\/[A-Za-z0-9_\-./]+\.(png|jpg|jpeg)$/i;

const FIELD = '滝川滑空場（北海道・北緯43.5度、東経141.9度あたり）';

const SYSTEM = `あなたは日本の滑空機パイロットに向けて気象資料を読み解く助手です。
読み手は${FIELD}で自家用操縦士（上級滑空機）の口述試験を控えており、
試験官に気象状況を説明できるようになることを目指しています。

守ること：
- 図から実際に読み取れることだけを述べる。読めない箇所は「この図からは読み取れません」と正直に言う
- 数値やラベルが判読できないときは、推測で断定しない
- **飛べる・飛べないの判断は述べない**。事実と、それが滑空にとって何を意味するかの説明までにとどめる
- ${FIELD}から見てどうか、という視点で書く
- 専門用語には短い言い添えをつける
- 日本語で、Markdownの見出しや箇条書きを使って簡潔に。全体で800字以内にまとめ、途中で終わらせない`;

const ASK = {
  chart: `渡した天気図について、次の順で説明してください。
実況と予想の2枚がある場合は、**2枚を見比べて変化を述べる**のが要点です。

1. **気圧配置の型**（西高東低、移動性高気圧、南岸低気圧など）と、その典型的な特徴
2. **高気圧・低気圧・前線の位置**と、進んでいく方向
3. **${FIELD}がその配置のどこに位置するか**
4. **24時間後にかけてどう変わるか**。前線や低気圧が滝川へ近づくのか遠ざかるのか、
   気圧傾度は緩むのか強まるのか。2枚目が無ければこの項目は飛ばす
5. **等圧線の混み具合**から読める地上風の強さの傾向（風向も分かれば）
6. 滑空の観点で注目すべき点（上昇風が期待できる配置か、安定か不安定か、風は強いか）`,

  sigwx: `この下層悪天予想図について、次の順で説明してください。
1. この図の**有効時刻**（図中に書かれていれば）
2. **${FIELD}の周辺**にかかっている、雲・視程・乱気流・着氷の記号や数値
3. 雲底と雲頂の高さ、視程の値が読み取れれば、その数値
4. 前線や不安定域の位置
5. それらが滑空にとって何を意味するか`,

  ir: `この赤外衛星画像について説明してください。白いほど雲頂が高い（＝背の高い雲）ことを踏まえ、
雲域の分布と発達の程度、${FIELD}周辺の雲の状況、雲域がどちらへ動きそうかを述べてください。`,

  vis: `この可視衛星画像について説明してください。雲の厚みや粒の細かさ、対流雲（積雲）が
立っているかどうかに注目し、${FIELD}周辺の雲の状況と、上昇風が期待できそうかを述べてください。`,
};

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

/* Workers には Buffer が無いので自前で。一度に渡すと引数が多すぎて
   落ちるため、少しずつ区切って積む */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

function mediaTypeOf(ct, url) {
  const t = String(ct || '').split(';')[0].trim().toLowerCase();
  if (t === 'image/png' || t === 'image/jpeg' || t === 'image/gif' || t === 'image/webp') return t;
  return /\.(jpg|jpeg)$/i.test(url) ? 'image/jpeg' : 'image/png';
}

export async function explainImage(body, env) {
  const kind = String((body && body.kind) || 'chart');

  /* 1枚でも複数枚でも受ける。複数のときは images:[{label,url}] */
  const list = Array.isArray(body && body.images) && body.images.length
    ? body.images.slice(0, 3)
    : [{ label: '', url: String((body && body.url) || '') }];

  if (!list.every(it => IMG_OK.test(String(it && it.url)))) {
    return json({ error: '解説できるのは気象庁の画像だけです' }, 400);
  }
  if (!ASK[kind]) {
    return json({ error: '解説の種類が不明です' }, 400);
  }
  const key = env && env.ANTHROPIC_API_KEY;
  if (!key) {
    return json({ error: 'サーバーに ANTHROPIC_API_KEY が設定されていません' }, 500);
  }

  /* 画像を取ってくる */
  const parts = [];
  for (const it of list) {
    let img;
    try {
      img = await fetch(it.url, { cf: { cacheTtl: 300, cacheEverything: true } });
    } catch (e) {
      return json({ error: '画像を取得できませんでした：' + ((e && e.message) || e) }, 502);
    }
    if (!img.ok) return json({ error: '画像を取得できませんでした（HTTP ' + img.status + '）' }, 502);
    const buf = await img.arrayBuffer();
    if (!buf.byteLength) return json({ error: '画像が空でした' }, 502);
    if (buf.byteLength > 4 * 1024 * 1024) return json({ error: '画像が大きすぎます' }, 413);
    if (it.label) parts.push({ type: 'text', text: '【' + String(it.label).slice(0, 40) + '】' });
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaTypeOf(img.headers.get('content-type'), it.url), data: toBase64(buf) },
    });
  }
  parts.push({ type: 'text', text: ASK[kind] });

  /* 解説を作らせる */
  let r;
  try {
    r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEM,
        messages: [{ role: 'user', content: parts }],
      }),
    });
  } catch (e) {
    return json({ error: '解説の取得に失敗しました：' + ((e && e.message) || e) }, 502);
  }

  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok) {
    const m = j && j.error && (j.error.message || j.error.type);
    return json({ error: 'HTTP ' + r.status + (m ? '：' + m : '') }, r.status);
  }
  const out = (j && Array.isArray(j.content))
    ? j.content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim() : '';
  if (!out) {
    const why = (j && j.stop_reason) ? '（stop_reason: ' + j.stop_reason + '）' : '';
    return json({ error: '解説が空でした' + why }, 502);
  }

  /* 上限に当たって途中で終わったときは、黙って切らずに断りを入れる */
  const cut = j && j.stop_reason === 'max_tokens';
  return json({ text: out + (cut ? '\n\n（長くなったため、ここで区切っています）' : ''),
    model: MODEL, images: list.map(it => it.url) }, 200);
}
