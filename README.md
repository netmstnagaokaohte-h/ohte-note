# ohte-note — note記事自動取得システム

新潟県立長岡大手高等学校 公式サイト「学校の様子」セクションに、note公式アカウント（[nagaokaohte-hs.note.jp](https://nagaokaohte-hs.note.jp/)）の最新記事を自動表示するための仕組みです。

---

## このリポジトリの役割

GitHub Actionsが平日の決まった時刻にnoteのRSSを取得し、JSON形式に整形してGitHub Pagesで配信します。学校サーバー上のHTML（`events.html` / `index.html`）はこのJSONを読み込んで記事カードを描画します。

```
note(RSS)
   │  GitHub Actionsが定期取得
   ▼
data/news.json  ──公開──▶  https://sciencation.github.io/ohte-note/data/news.json
                                      │
                                      │ 学校サイトのJavaScriptが取得
                                      ▼
                          events.html / index.html に表示
```

---

# 第1部：技術担当者向け

## 1. リポジトリ構成

```
ohte-note/
├── .github/
│   └── workflows/
│       └── note-rss.yml          # GitHub Actions定義（cron + コミット）
├── scripts/
│   └── fetch-rss.js              # noteのRSSを取得・整形するNode.jsスクリプト
├── data/
│   └── news.json                 # 自動生成される記事データ（手動編集不要）
└── README.md                     # このファイル
```

## 2. 動作タイミング

| 種別 | 時刻（JST） | cron式（UTC） |
|---|---|---|
| 平日 昼 | 13:00 | `0 4 * * 1-5` |
| 平日 夜 | 19:00 | `0 10 * * 1-5` |

土日祝は実行されません。手動実行も可能です（GitHubのActionsタブから "Run workflow"）。

## 3. 出力JSONの仕様

`data/news.json`

```json
{
  "generated_at": "2026-05-02T04:00:12.345Z",
  "source": "https://nagaokaohte-hs.note.jp/rss",
  "items": [
    {
      "title": "大手部活動note【…】",
      "link": "https://note.com/nagaokaohte_hs/n/xxxxx",
      "date": "2026/04/30",
      "excerpt": "本文先頭から90字程度の抜粋…"
    }
  ]
}
```

- 最大10件
- `excerpt` はHTMLタグを除去し、note特有の「続きをみる」を取り除いた上で90字に切り詰め
- 取得失敗時は既存の `news.json` を保持し、無ければ空配列＋`error`フィールドを書き出します

## 4. 学校サーバー側のJavaScript

`events.html` と `index.html` 内のスクリプトは、以下のURLから直接JSONを取得します。

```
https://sciencation.github.io/ohte-note/data/news.json?d=YYYY-MM-DD
```

- `?d=YYYY-MM-DD` はキャッシュバスター（日付が変わると確実に新しいJSONが読まれる）
- `events.html` … 6件をグリッド表示（`#noteGrid`）
- `index.html` … 最新1件をサイドバー表示（`#noteSidebar`）

## 5. 初回セットアップ

すでに完了済みですが、引き継ぎのために手順を残します。

1. GitHubアカウント `sciencation` で新規Public リポジトリ `ohte-note` を作成
2. このパッケージのファイルをアップロード（またはgit push）
3. リポジトリの **Settings → Pages** で
   - Source: **Deploy from a branch**
   - Branch: **main / (root)**
4. **Settings → Actions → General → Workflow permissions** を
   - **Read and write permissions** に設定
5. **Actions タブ** → "note RSS to JSON" → "Run workflow" で初回実行
6. 数分後 `https://sciencation.github.io/ohte-note/data/news.json` がブラウザで見られればOK

## 6. 動作確認

ブラウザで以下にアクセスし、JSONが見えることを確認します。

- https://sciencation.github.io/ohte-note/data/news.json

学校サイト側は以下が想定通りに表示されればOKです。

- https://nagaokaohte-h.nein.ed.jp/newweb/events.html （6件のカード）
- https://nagaokaohte-h.nein.ed.jp/newweb/index.html （サイドバーに最新1件）

## 7. トラブルシューティング

| 症状 | 原因の候補 | 対処 |
|---|---|---|
| 記事が更新されない | Actionsが動いていない | Actionsタブで失敗していないか確認 → Re-run jobs |
| 「記事を取得できませんでした」が表示 | GitHub Pagesが落ちている／JSONが壊れている | `data/news.json` を直接ブラウザで開いて検証 |
| 記事は出るが日付が古い | キャッシュ | URLに `?d=YYYYMMDD` を付けて再読込 |
| 画像が出ない | 仕様 | noteのRSSはアイキャッチ画像を含まないため、テキストのみ表示としています |
| Actionsで `403 push declined` | 書き込み権限不足 | Settings → Actions → General → Workflow permissions を Read and write に |

## 8. メンテナンス時の注意

- **`data/news.json` は手動編集しないでください**（Actionsが上書きします）
- `scripts/fetch-rss.js` の改修時は、ローカルで `node scripts/fetch-rss.js` を実行して動作確認してから push
- noteのRSS仕様が変わった場合（要素名や階層）、`fetch-rss.js` の正規表現の見直しが必要です

## 9. 将来の移行について

現在は個人アカウント `sciencation` で運用していますが、運用が安定したら学校または教育委員会のOrganizationアカウントへ移管することを推奨します。

移管手順は GitHub の **Settings → Transfer ownership** から実施できますが、リポジトリURLが変わるため、`events.html` / `index.html` 内の `dataUrl` を新URLに書き換える必要があります（grep対象は2ファイルのみ）。

---

# 第2部：管理職向け（運用と費用の概要）

## このシステムは何をしているか

学校公式サイトの「学校の様子」ページに、noteで公開した最新記事を**自動で6件並べて表示**する仕組みです。これまではnoteに記事を書いても、学校サイトには手動で反映する必要がありました。今後は**何もしなくても、平日の13時と19時にサイトが自動更新**されます。

## 費用について

**ゼロ円** で運用できます。

- 利用するサービス（GitHub Actions / GitHub Pages）はいずれも公開リポジトリでは無料枠で十分賄えます
- 月あたりの実行は最大44回（22平日 × 2回）×数秒 で、無料枠の数千分の1以下です
- 学校の既存サーバーに追加のソフト導入は一切ありません

## 運用負荷について

**ほぼゼロ** です。

- 記事の追加・編集は **これまで通り note の管理画面で行うだけ**
- 学校サイトへの反映は完全自動
- 記事を削除した場合も、noteから消えれば学校サイトからも自動的に消えます（次回更新時）

## セキュリティについて

- 学校サーバーのFTPパスワードを外部サービスに渡す必要はありません
- 学校サーバーのHTML（`events.html` / `index.html`）は一度設置すれば、その後の更新は不要です
- データの流れは「note → GitHub → 学校サイト訪問者のブラウザ」で、学校サーバーは経由しません

## 万が一の場合

- GitHubが障害で止まっても、学校サイト本体は通常通り表示されます
- 記事カード部分のみ「記事を取得できませんでした noteで直接ご覧ください」という案内に切り替わります
- 障害復旧後は自動で元に戻ります（管理者による作業不要）

## 担当者交代時

- このシステムは個人アカウント `sciencation` で動いています
- 担当者交代の際は、本READMEの **第1部・9章** の手順で、学校または教育委員会のGitHub Organizationへ移管することを推奨します

---

## 連絡先

設定・運用に関する技術的な問い合わせは、本リポジトリのIssuesまたは構築担当者まで。

- リポジトリ: https://github.com/sciencation/ohte-note
- 公開JSON: https://sciencation.github.io/ohte-note/data/news.json
- 学校サイト: https://nagaokaohte-h.nein.ed.jp/newweb/
