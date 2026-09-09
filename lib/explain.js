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

  sigwx: `渡した下層悪天予想図は、3時間後・6時間後・9時間後の予想の3枚です。
**3枚を見比べて、時間とともにどう変わるかを述べる**のが要点です。次の順で説明してください。

1. **${FIELD}の周辺**にかかっている、雲・視程・乱気流・着氷の記号や数値（3枚それぞれ）
2. 雲底と雲頂の高さ、視程の値が読み取れれば、その数値
3. **時間とともにどう変わるか**。悪化するのか、改善するのか、変化が大きいのは何時間後か
4. 前線や不安定域の位置と、その動き
5. それらが滑空にとって何を意味するか`,

  ir: `赤外衛星画像を**古い順に**並べて渡します。白いほど雲頂が高い（＝背の高い雲）です。
1枚ずつではなく、**並べて動きを読む**のが要点です。次の順で説明してください。

1. **雲域の動き**。どの雲域がどちらへ、どれくらいの速さで動いているか
2. **発達か衰えか**。白さ（雲頂の高さ）が時間とともに増しているか、薄れているか
3. **${FIELD}周辺のいま**の雲の状況
4. **このまま推移すると滝川はどうなるか**。雲域が近づくのか、抜けるのか、
   何時間後くらいにかかりそうか（画像の時刻から見積もる）
5. 滑空の観点で注目すべき点`,

  brief: `①天気図（実況・24時間後）、②赤外衛星（古い順）、③可視衛星、④下層悪天予想図、
そして⑤近傍空港の METAR / TAF を、まとめて渡します。

**ばらばらに説明せず、1つの筋にまとめてください。** 大きい場から小さい場へ、
①→⑤の順に降りていき、最後に全体を1つの話にまとめます。

1. **総観場**（①）—— 気圧配置の型、高低気圧と前線の位置、24時間後にかけての動き
2. **雲の実態**（②③）—— 雲域がどちらへ動いているか、発達か衰えか、積雲は立っているか
3. **下層の予想**（④）—— ${FIELD}周辺の雲底・視程・乱気流・着氷
4. **近傍空港の数字**（⑤）—— 風・視程・雲底の実測と、これからの変化
5. **まとめ** —— ①〜⑤が互いに整合しているか。食い違っていればそこを指摘する。
   ${FIELD}の今日はどういう空か、これから何時間でどう変わるか
6. **注意して見るべき点** —— 判断は人がするので、決めつけずに
   「ここを確かめるべき」という形で挙げる
7. **試験官への説明の組み立て** —— 上の内容を口頭で説明するとしたら、
   どの順で、どの数字を挙げて話すか。3〜4文の例を示す

全体で1200字以内。`,

  vis: `可視衛星画像を**古い順に**並べて渡します。1枚ずつではなく、
**並べて動きを読む**のが要点です。次の順で説明してください。

1. **雲域の動き**。どの雲域がどちらへ動いているか
2. **対流雲（積雲）が立ってきているか**。粒状の雲が時間とともに増えているか、
   消えているか。日射で午後に向けて発達しそうか
3. **${FIELD}周辺のいま**の雲の状況（雲の厚み、粒の細かさ）
4. **上昇風（サーマル）が期待できそうか**。積雲列が並んでいれば、その向き
5. 滑空の観点で注目すべき点`,
};

/* 「①〜④それぞれ」の簡潔版。読み込むのに時間がかかる詳細版とは別に、
   ${FIELD}の天気・風（風向風速）・状況・これからの見通しだけを
   短く伝える。ASK（詳細版）とは別物として、"brief"（①〜⑤まとめて）
   とも混同しないよう ASK_CONCISE という別名にしてある */
const ASK_CONCISE = {
  chart: `渡した天気図から、要点だけを簡潔に。
${FIELD}周辺の気圧配置（天気の背景）・風向風速の傾向・24時間後にかけての
見通しを、120字程度の短い文章でまとめてください。箇条書きにせず、
飛べる・飛べないの判断はしないこと。`,

  sigwx: `渡した下層悪天予想図（3・6・9時間後）から、要点だけを簡潔に。
${FIELD}周辺の天気・風（矢羽根から読める風向風速）の状況と、
時間とともにどう変わるかを、120字程度の短い文章でまとめてください。
箇条書きにせず、飛べる・飛べないの判断はしないこと。`,

  ir: `渡した赤外衛星画像（古い順）から、要点だけを簡潔に。
${FIELD}周辺の天気（雲の状況）と、雲の動きから読める風向の傾向、
このあとの見通しを、120字程度の短い文章でまとめてください。
箇条書きにせず、飛べる・飛べないの判断はしないこと。`,

  vis: `渡した可視衛星画像（古い順）から、要点だけを簡潔に。
${FIELD}周辺の天気（雲の状況・積雲の有無）と、雲の動きから読める
風向の傾向、このあとの見通しを、120字程度の短い文章でまとめてください。
箇条書きにせず、飛べる・飛べないの判断はしないこと。`,
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

/* 図に印字されている日時を読み取る。ファイル名から組み立てた時刻は
   発表時刻と有効時刻がずれることがあるので、図そのものを正とする。
   短い問い合わせなので費用はごくわずか。端末側でも覚えるため、
   同じ図について何度も呼ぶことはない */
export async function imageTime(body, env) {
  const url = String((body && body.url) || '');
  if (!IMG_OK.test(url)) return json({ error: '気象庁の画像だけ読み取れます' }, 400);
  const key = env && env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: 'サーバーに ANTHROPIC_API_KEY が設定されていません' }, 500);

  let img;
  try {
    img = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
  } catch (e) {
    return json({ error: '画像を取得できませんでした：' + ((e && e.message) || e) }, 502);
  }
  if (!img.ok) return json({ error: '画像を取得できませんでした（HTTP ' + img.status + '）' }, 502);
  const buf = await img.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 4 * 1024 * 1024) {
    return json({ error: '画像を読めませんでした' }, 502);
  }

  let r;
  try {
    r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 80,
        system: '図に印字された日時だけを読み取って返す。説明や前置きは書かない。',
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaTypeOf(img.headers.get('content-type'), url), data: toBase64(buf) } },
          { type: 'text', text: [
            'この気象庁の図に印字されている日時を読み取ってください。',
            '実況図なら解析時刻、予想図なら有効時刻です。',
            '日本時間（JST）に直し、返答は1行だけ、書式は「2026-09-10 00:00」',
            '（西暦-月-日 24時間表記の時:分）で返す。UTCしか読めなければ',
            '9時間足してJSTに直すこと（日付をまたぐ場合は日付も進める）。',
            '書式が守れない・読み取れないときは「不明」とだけ返す。',
          ].join('\n') },
        ] }],
      }),
    });
  } catch (e) {
    return json({ error: '読み取りに失敗しました：' + ((e && e.message) || e) }, 502);
  }

  const txt = await r.text();
  let j = null;
  try { j = JSON.parse(txt); } catch (e) {}
  if (!r.ok) {
    const m = j && j.error && (j.error.message || j.error.type);
    return json({ error: 'HTTP ' + r.status + (m ? '：' + m : '') }, r.status);
  }
  const out = (j && Array.isArray(j.content))
    ? j.content.filter(c => c.type === 'text').map(c => c.text).join(' ').trim().split(/\n/)[0].trim() : '';
  return json({ text: (!out || /^不明/.test(out)) ? '' : out.slice(0, 60) }, 200);
}

export async function explainImage(body, env) {
  const kind = String((body && body.kind) || 'chart');
  /* concise：①〜④それぞれの「簡潔版」。無指定なら今までどおりの詳細版 */
  const concise = String((body && body.style) || '') === 'concise';
  const ask = concise ? ASK_CONCISE : ASK;

  /* 1枚でも複数枚でも受ける。複数のときは images:[{label,url}]。
     衛星画像は時系列で読ませたいので、10枚ぶんを見込んで上限を取る */
  const list = Array.isArray(body && body.images) && body.images.length
    ? body.images.slice(0, kind === 'brief' ? 10 : 12)
    : [{ label: '', url: String((body && body.url) || '') }];

  if (!list.every(it => IMG_OK.test(String(it && it.url)))) {
    return json({ error: '解説できるのは気象庁の画像だけです' }, 400);
  }
  if (!ask[kind]) {
    return json({ error: '解説の種類が不明です' }, 400);
  }
  const key = env && env.ANTHROPIC_API_KEY;
  if (!key) {
    return json({ error: 'サーバーに ANTHROPIC_API_KEY が設定されていません' }, 500);
  }

  /* 画像を取ってくる。枚数が多いので同時に取りにいく */
  let got;
  try {
    got = await Promise.all(list.map(async it => {
      const img = await fetch(it.url, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (!img.ok) throw new Error('HTTP ' + img.status);
      const buf = await img.arrayBuffer();
      if (!buf.byteLength) throw new Error('中身が空');
      return { label: it.label, url: it.url, buf, ct: img.headers.get('content-type') };
    }));
  } catch (e) {
    return json({ error: '画像を取得できませんでした：' + ((e && e.message) || e) }, 502);
  }

  /* 1枚あたりと合計の両方に上限を置く。多すぎると送れない */
  let total = 0;
  for (const g of got) {
    if (g.buf.byteLength > 4 * 1024 * 1024) return json({ error: '画像が大きすぎます' }, 413);
    total += g.buf.byteLength;
  }
  if (total > 18 * 1024 * 1024) return json({ error: '画像の合計が大きすぎます' }, 413);

  const parts = [];
  for (const g of got) {
    if (g.label) parts.push({ type: 'text', text: '【' + String(g.label).slice(0, 40) + '】' });
    parts.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaTypeOf(g.ct, g.url), data: toBase64(g.buf) },
    });
  }
  /* 電文のように、画像ではなく文字で渡したいものを添える */
  const extra = String((body && body.text) || '').slice(0, 6000).trim();
  if (extra) parts.push({ type: 'text', text: extra });

  parts.push({ type: 'text', text: ask[kind] });

  /* 解説を作らせる。簡潔版は短くまとめるだけなので上限も低くてよい */
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
        max_tokens: concise ? 400 : (kind === 'brief' ? 4000 : 3000),
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
