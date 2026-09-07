# スマホから開けるようにする（Cloudflare 設定手順）

やりたいことは2つ。

1. **ファイルを毎回スマホに移さなくてよくする** —— URLを開くだけで最新版になる
2. **AVWX のトークンをサーバー側に隠す** —— 端末には何も入れずに済む

**費用はかかりません**（無料枠のみ）。カード登録も不要です。

> Cloudflare の画面は時々変わります。ボタンの文言が少し違っても、
> **やることは同じ**なので、近い名前のものを探してください。

---

## Workers と Pages のどちらでもよい

Cloudflare には配信のしくみが2つあります。**作った側に合わせれば、どちらでも動きます。**

| 見分け方 | どちら | 入口のファイル |
|---|---|---|
| 設定に **Deploy command `npx wrangler deploy`** がある | **Workers** | `worker.js` |
| 設定に **Build output directory** がある | **Pages** | `functions/api/[[route]].js` |

中継の中身（`lib/proxy.js`）は共通なので、**両方に対応済み**です。

---

## STEP 1 ── AVWX のトークンを取る

1. https://account.avwx.rest/plans を開く
2. **Hobby** を選ぶ（**$0 / 4,000 calls per day**）
3. メールアドレスとパスワードで登録
4. ログイン後に出る **API Token** をコピーしておく

> `abcd1234-...` のような文字列です。**この後すぐ使う**ので、
> メモ帳などに貼っておいてください。

---

# ■ Workers で作った場合

## STEP 2W ── ビルド設定を確かめる

Worker → **Settings** → **Build**

| 項目 | 正しい値 |
|---|---|
| **Build command** | **None（空欄）** |
| **Deploy command** | **`npx wrangler deploy`** |
| **Root directory** | **`/`** |
| **Build variables** | **None** |

この通りなら触らなくて構いません。設定を読むのは、リポジトリにある
**`wrangler.jsonc`** です。

> ### Worker の名前が合っているか
>
> `wrangler.jsonc` の1行目に `"name": "takikawa-wx"` と書いてあります。
> Cloudflare 側で**別の名前**で作っていたら、ここを**その名前に書き換えて**
> push してください。食い違うと、別の Worker が新しく作られてしまいます。

## STEP 3W ── Production branch を変える ← ご質問の箇所

**Worker → Settings → Build** の中に **Branch control**（ブランチ管理）
という区画があります。そこの **Production branch** を

```
claude/glider-pilot-exam-app-ugm9wt
```

に変更してください。**既定は `main`** です。作業はすべて上のブランチにあるので、
`main` のままだと**古い内容が公開されます**。

`Settings → Build` の中に見当たらないときは、**Settings** の中を
「Branch」「Production」で探してください。Git をつないだ直後は
**Build → Git repository** の並びに置かれていることもあります。

> ### もっと簡単な方法
>
> **作業を `main` に取り込んでしまえば、この設定は不要**になります
> （既定のままで正しく配信される）。
> ご希望なら私のほうで `main` に反映できます。声をかけてください。

## STEP 4W ── トークンを隠す

### ⚠ 入れる場所を間違えやすい

**Settings** の右側にサイドバーがあり、区画が分かれています。

```
Observability
Runtime      ← ★ こちらに入れる（Worker が動くときの設定）
Builds       ← ✗ こちらではない（ビルド中だけの設定）
Triggers
General
```

**Builds の側にも同じ名前の「Variables and secrets」があります**が、そちらは
`npx wrangler` に渡すためのもので、**出来上がった Worker からは見えません**。
入れても `/api/health` は `未設定` のままになります。

### 入れかた

Worker → **Settings** → **Runtime** → **Variables and Secrets** → **Add**
（上のタブの **Bindings** からでも同じところに行けます）

| 欄 | 入れる値 |
|---|---|
| **Type** | **Secret**（Text ではなく Secret） |
| **Variable name** | `AVWX_TOKEN` |
| **Value** | STEP 1 でコピーしたトークン |

**Deploy** / **Save** を押します。

### ⚠ 保存しただけでは効きません

**Deployments** タブ → 一番上のデプロイの **…** → **Retry deployment**
（または右上の **New deployment**）

## STEP 5W ── 開く

```
https://takikawa-wx.<あなたのサブドメイン>.workers.dev/tenkizu_check.html
```

正確な URL は Worker の画面の上のほうに出ています。**`.pages.dev` ではなく
`.workers.dev`** です。

---

# ■ Pages で作った場合

## STEP 2P ── ビルド設定

| 項目 | 入れる値 |
|---|---|
| **Project name** | 好きな名前（これがURLになる） |
| **Production branch** | **`claude/glider-pilot-exam-app-ugm9wt`** |
| **Framework preset** | **None** |
| **Build command** | **空欄のまま** |
| **Build output directory** | **`/`** |

Production branch は **Settings → Build → Production branch** で後から変えられます。

## STEP 3P ── トークンを隠す

**Settings** → **Variables and Secrets** → **Add**
（Type = **Secret**、名前 `AVWX_TOKEN`）

**Production と Preview の両方**に入れて、
**Deployments → 最新の … → Retry deployment**。

## STEP 4P ── 開く

```
https://<プロジェクト名>.pages.dev/tenkizu_check.html
```

---

# 共通 ── 動いたかの確かめ方

⑤ METAR / TAF の下に **緑色で「AVWX から取得しました」** と出れば成功です。
**トークンの入力欄は空のままで構いません。**

### `/api/health` で切り分ける

```
https://<あなたのURL>/api/health
```

AVWX に問い合わせないので、無料枠の回数を消費しません。

| 返り値 | 意味 |
|---|---|
| `"avwx_token":"設定済み"` | ✅ 完了 |
| `"env_keys":["ASSETS"]` だけ | トークンが Worker に届いていない（→ STEP 4W の場所を確認） |
| `"version"` が古い | 新しいビルドがまだ配信されていない |
| 404 | worker.js が配信されていない。ビルドのログを確認 |

値は返しません（名前と文字数だけ）。

電文まで見たいときは

```
https://<あなたのURL>/api/metar/RJEC
```

で `{"raw":"RJEC 0701...` が返れば正常です。

### スマホのホーム画面に置く

- **iPhone**：Safari で開く → 下の**共有**ボタン → **ホーム画面に追加**
- **Android**：Chrome で開く → 右上の **⋮** → **ホーム画面に追加**

---

## うまくいかないときは

| 症状 | 原因と対処 |
|---|---|
| デプロイが**失敗**する | `wrangler.jsonc` の `name` が Cloudflare 側の Worker 名と一致しているか |
| ページが **404** | Workers なら Root directory が `/` か。Pages なら Build output directory が `/` か |
| **「サーバーに AVWX_TOKEN が設定されていません」** | Secret 未登録、**Builds 側に入れてしまっている**、または **Retry deployment をしていない**。`/api/health` の `env_keys` に `AVWX_TOKEN` が出るか確認 |
| `/api/metar/RJEC` が **404** | Workers なら `wrangler.jsonc` と `worker.js` が push されているか。Pages なら `functions/` が push されているか |
| **内容が古い** | **Production branch** が `claude/glider-pilot-exam-app-ugm9wt` になっているか |
| METAR は出るが**天気図が出ない** | 中継とは別系統です。画像を直接取りにいくので、時間をおいて再読込 |

---

## 仕組み（読まなくても使えます）

```
ブラウザ  →  /api/metar/RJEC  →  （Cloudflare がトークンを付ける）  →  avwx.rest
```

トークンはサーバーの環境変数にあるだけで、**ページのソースにも通信にも
出てきません**。ページを誰かに見られても漏れません。

中継しているのは次の4つだけです。踏み台に使われないよう、
それ以外への転送は拒否します。

| 窓口 | 中身 |
|---|---|
| `/api/metar/<ICAO>` | AVWX の METAR |
| `/api/taf/<ICAO>` | AVWX の TAF |
| `/api/station/<ICAO>` | AVWX の空港情報 |
| `/api/jma/bosai/….json` | 気象庁の JSON（天気図・衛星の時刻表） |

METAR は2分、気象庁の JSON は5分だけ Cloudflare 側に保持します。
無料枠（1日4,000回）を使い切らないための措置です。

ファイルの役割：

| ファイル | 役割 |
|---|---|
| `lib/proxy.js` | 中継の中身（Workers / Pages 共通） |
| `worker.js` | Workers の入口 |
| `wrangler.jsonc` | Workers の設定 |
| `functions/api/[[route]].js` | Pages の入口 |
| `.assetsignore` | 配信しないファイルの指定 |

---

## 手元のファイルのまま使いたいとき

サーバーに置いたうえで、**手元の HTML からその中継だけを使う**こともできます。
`tenkizu_check.html` ⑤の **「中継サーバーのURL」** 欄に

```
https://<あなたのURL>/api
```

と入れて **保存**。これでトークンを端末に入れずに済みます。

---

## 公開範囲について

`*.workers.dev` / `*.pages.dev` の URL は、**知っている人なら誰でも開けます**。
中身は試験対策の資料なので実害は薄いはずですが、閉じたい場合は
**Cloudflare Access**（無料枠あり）で自分のメールアドレスだけを許可できます。
