# スマホから開けるようにする（Cloudflare Pages）

目的は2つ。

1. **ファイルを毎回スマホに移さなくてよくする**。URLを開くだけで最新版になる
2. **AVWX のトークンをサーバー側に隠す**。端末には何も入れずに済む

費用はかかりません（無料枠のみ）。ビルドも不要です。

---

## 手順

### 1. GitHub に push する（**完了済み**）

`mitsuru02-svg/oral-exam` の `claude/glider-pilot-exam-app-ugm9wt` ブランチに
反映済みです。

### 2. AVWX のトークンを取る

https://account.avwx.rest/plans で **Hobby（無料・1日4,000回）** に登録し、
トークンを控えます。

### 3. Cloudflare Pages につなぐ

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages**
2. **Connect to Git** で `mitsuru02-svg/oral-exam` を選ぶ
3. ビルド設定は**すべて空のまま**にする

   | 項目 | 値 |
   |---|---|
   | Framework preset | **None** |
   | Build command | **（空欄）** |
   | Build output directory | **`/`** |

4. **Production branch** を **`claude/glider-pilot-exam-app-ugm9wt`** にする

   ここが要注意です。既定では `main` が本番になりますが、作業は上のブランチに
   あるので、`main` のままだと**古い内容が公開されます**。
   作成画面で選べない場合は、作成後に
   **Settings → Build → Production branch** で変更してください。

   （将来この作業を `main` に取り込んだら、ここを `main` に戻して構いません）

5. **Save and Deploy**

### 4. トークンを環境変数に入れる

Pages のプロジェクト → **Settings** → **Variables and Secrets** →
**Add**（種別は **Secret**）

| 名前 | 値 |
|---|---|
| `AVWX_TOKEN` | 手順2で控えたトークン |

**Production と Preview の両方**に入れてください。入れたあと
**Deployments → 最新のものを Retry deployment** で反映させます。

### 5. 開く

`https://<プロジェクト名>.pages.dev/tenkizu_check.html`

スマホのホーム画面に追加しておけば、アプリのように開けます。
⑤の下に緑で「AVWX から取得しました」と出れば成功です。
**トークンの入力欄は空のままで構いません。**

---

## 仕組み

`functions/api/[[route]].js` が中継役です。

```
ブラウザ  →  /api/metar/RJEC  →  （Cloudflare 側でトークンを付ける）  →  avwx.rest
```

トークンはサーバーの環境変数にあるだけで、**ページのソースにも通信にも出てきません**。
ページを誰かに見られても、トークンは漏れません。

中継しているのは次の4つだけです。踏み台に使われないよう、
それ以外への転送は拒否します。

| 窓口 | 中身 |
|---|---|
| `/api/metar/<ICAO>` | AVWX の METAR |
| `/api/taf/<ICAO>` | AVWX の TAF |
| `/api/station/<ICAO>` | AVWX の空港情報 |
| `/api/jma/bosai/….json` | 気象庁の JSON（天気図・衛星の時刻表） |

METAR は2分、気象庁の JSON は5分だけ Cloudflare 側で保持します。
無料枠（1日4,000回）を使い切らないための措置です。

---

## 手元のファイルのまま使いたいとき

サーバーに置いたうえで、**手元の HTML からその中継だけを使う**こともできます。
`tenkizu_check.html` ⑤の **「中継サーバーのURL」** 欄に

```
https://<プロジェクト名>.pages.dev/api
```

と入れて保存してください。トークンは端末に入れずに済みます。

---

## 公開範囲について

`*.pages.dev` の URL は、**知っている人なら誰でも開けます**。
中身は試験対策の資料なので実害はありませんが、閉じたい場合は
Cloudflare Access（無料枠あり）でメールアドレス認証をかけられます。

Pages のプロジェクト → **Settings** → **Access policy** から設定します。
