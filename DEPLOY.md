# スマホから開けるようにする（Cloudflare Pages 設定手順）

やりたいことは2つ。

1. **ファイルを毎回スマホに移さなくてよくする** —— URLを開くだけで最新版になる
2. **AVWX のトークンをサーバー側に隠す** —— 端末には何も入れずに済む

**費用はかかりません**（無料枠のみ）。クレジットカードの登録も不要です。
所要時間は15分ほど。

> Cloudflare の画面は時々変わります。ボタンの文言が少し違っても、
> **やることは同じ**なので、近い名前のものを探してください。

---

## 全体像

```
GitHub（コード）  →  Cloudflare Pages（配信）  →  スマホで開く
                          ↑
                    AVWX_TOKEN をここに隠す
```

---

## STEP 0 ── 準備するもの

| もの | 状態 |
|---|---|
| GitHub のリポジトリ | ✅ 完了（push 済み） |
| Cloudflare アカウント | STEP 1 で作る |
| AVWX のトークン | STEP 2 で取る |

---

## STEP 1 ── Cloudflare のアカウントを作る

すでに持っている場合は STEP 2 へ。

1. https://dash.cloudflare.com/sign-up を開く
2. **メールアドレス**と**パスワード**を入れて **Sign Up**
3. 届いたメールの確認リンクを押す

**カード情報は聞かれません。** 聞かれたら有料プランの画面に入っているので、
戻って無料（Free）を選んでください。

---

## STEP 2 ── AVWX のトークンを取る

1. https://account.avwx.rest/plans を開く
2. **Hobby** を選ぶ（**$0 / 4,000 calls per day**）
3. メールアドレスとパスワードで登録
4. ログイン後の画面に出る **API Token** をコピーしておく

> トークンは `abcd1234-...` のような文字列です。
> **この後すぐ使う**ので、メモ帳などに貼っておいてください。

---

## STEP 3 ── Pages のプロジェクトを作る

### 3-1. 作成画面を開く

1. https://dash.cloudflare.com にログイン
2. 左のメニューから **Workers & Pages**（または **Compute**）
3. **Create**（または **Create application**）ボタン

### 3-2. ⚠ ここが間違えやすい ── 「Pages」のタブを選ぶ

画面の上に **Workers** と **Pages** のタブが並んでいます。
**既定は Workers** になっているので、必ず **Pages** に切り替えてください。

そのうえで **Connect to Git** を押します。

> **Upload assets** ではありません。Git につなぐと、以降 push するだけで
> 自動更新されます。

### 3-3. GitHub とつなぐ

1. **GitHub** を選ぶ
2. 初回は GitHub の認可画面が出るので、**mitsuru02-svg** を選んで許可
3. リポジトリの一覧から **oral-exam** を選ぶ
4. **Begin setup**

> 一覧に `oral-exam` が出ないときは、認可画面で
> **Only select repositories** にして `oral-exam` を追加してください。

### 3-4. ビルド設定 ── ここが肝心

**このアプリはビルドが要りません。** 空欄のままにするのが正解です。

| 項目 | 入れる値 |
|---|---|
| **Project name** | 好きな名前（例 `takikawa-wx`）。**これがURLになります** |
| **Production branch** | **`claude/glider-pilot-exam-app-ugm9wt`** ← ⚠ 下の注意を参照 |
| **Framework preset** | **None** |
| **Build command** | **空欄のまま** |
| **Build output directory** | **`/`** |

> ### ⚠ Production branch を必ず変えること
>
> 既定は **`main`** です。しかし作業はすべて
> `claude/glider-pilot-exam-app-ugm9wt` にあるので、**`main` のままだと
> 古い内容が公開されます**。
>
> 作成画面で選べない場合は、作ったあとに
> **Settings → Build → Production branch** で変更できます。

最後に **Save and Deploy** を押します。1〜2分で終わります。

この時点で `https://<プロジェクト名>.pages.dev/tenkizu_check.html` が開きますが、
**METAR/TAF はまだ出ません**（トークンが未設定のため）。次で入れます。

---

## STEP 4 ── トークンをサーバーに隠す

1. 作ったプロジェクトを開く
2. **Settings** タブ
3. **Variables and Secrets**（または **Environment variables**）
4. **Add** を押して、次のとおり入れる

   | 欄 | 入れる値 |
   |---|---|
   | **Type** | **Secret**（Text ではなく Secret） |
   | **Variable name** | `AVWX_TOKEN` |
   | **Value** | STEP 2 でコピーしたトークン |

5. **Production** と **Preview** の**両方**に入れる
6. **Save**

### ⚠ 保存しただけでは効きません

環境変数は**再デプロイしないと反映されません**。

**Deployments** タブ → 一番上のデプロイの右にある **…** →
**Retry deployment**

これで完了です。

---

## STEP 5 ── 開いて確かめる

```
https://<プロジェクト名>.pages.dev/tenkizu_check.html
```

⑤ METAR / TAF の下に **緑色で「AVWX から取得しました」** と出れば成功です。
**トークンの入力欄は空のままで構いません。**

### スマホのホーム画面に置く

- **iPhone**：Safari で開く → 下の**共有**ボタン → **ホーム画面に追加**
- **Android**：Chrome で開く → 右上の **⋮** → **ホーム画面に追加**

アプリのように開けるようになります。

---

## うまくいかないときは

| 症状 | 原因と対処 |
|---|---|
| ページが **404** | **Build output directory** が `/` になっているか確認（Settings → Build） |
| 「**サーバーに AVWX_TOKEN が設定されていません**」と出る | STEP 4 の Secret 未設定、または **Retry deployment をしていない** |
| **中継 HTTP 404** と出る | `functions/` フォルダが push されているか確認。Build output directory を `/` 以外にしていると関数が読まれません |
| **内容が古い** | **Production branch** が `claude/glider-pilot-exam-app-ugm9wt` になっているか確認 |
| METAR は出るが**天気図が出ない** | 中継とは別系統です。そのまま画像を取りにいくので、時間をおいて再読込 |

---

## 仕組み（読まなくても使えます）

`functions/api/[[route]].js` が中継役です。

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

---

## 手元のファイルのまま使いたいとき

サーバーに置いたうえで、**手元の HTML からその中継だけを使う**こともできます。
`tenkizu_check.html` ⑤の **「中継サーバーのURL」** 欄に

```
https://<プロジェクト名>.pages.dev/api
```

と入れて **保存**。これでトークンを端末に入れずに済みます。

---

## 公開範囲について

`*.pages.dev` の URL は、**知っている人なら誰でも開けます**。
中身は試験対策の資料なので実害は薄いはずですが、閉じたい場合は
**Cloudflare Access**（無料枠あり）でメールアドレス認証をかけられます。

プロジェクト → **Settings** → **Access policy** から設定します。
自分のメールアドレスだけを許可しておけば、他の人は開けません。
