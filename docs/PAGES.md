# GitHub Pages公開

テストプレイURL: https://yuji5124.github.io/TRACE/

## 原因と修正

2026-10-21、基準main `0de6db5` の公開URLはHTTP 404。
既存 `ci.yml` はテスト・ビルド・ブラウザ検証のみで、Pagesへdistを転送する処理がなかった。
`.github/workflows/deploy-pages.yml` を追加し、mainへのpush / workflow_dispatchで
Node.js 22・npm ci・npm run build後にdistをGitHub Pagesへ公開する。
PagesのSourceはユーザーがGitHub Actionsへ設定済み。

公開ワークフローは検証ワークフローを待たない。既存CIの検査は変更・無効化していない。
公開ジョブは同じワークフロー内のビルド成功を必須とする。
`github-pages` environmentとdeploy-pagesのpage_urlを使用。
手動実行もmainのみ。concurrencyで同時デプロイを直列化する。

## Actionsの確認

2026-10-21、各公式リポジトリのlatest releaseとaction.ymlを確認。

| Action | 採用major | 確認した安定版 |
|---|---|---|
| [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1) | v7 | v7.0.1 |
| [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0) | v7 | v7.1.0 |
| [configure-pages](https://github.com/actions/configure-pages/releases/tag/v6.0.0) | v6 | v6.0.0 |
| [upload-pages-artifact](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) | v5 | v5.0.0 |
| [deploy-pages](https://github.com/actions/deploy-pages/releases/tag/v5.0.1) | v5 | v5.0.1 |

これらのJS Actionsはnode24ランタイムに対応。アプリのビルドにはNode.js 22を使用。
既存CIのNode.js 20非推奨通知・GPU stall警告はPages 404とは分けて扱う。

## アセットと機能の保全

`vite.config.ts` の `base: "./"` は変更しない。HTMLの相対パスは /TRACE/assets/ に解決。
Three / physics / bvhの分割チャンクと動的importも相対パスで出力される。
`@dimforge/rapier3d-compat` はWASMのバイト列をJSへ内包するため、独立した.wasmのHTTPリクエストは不要。
実際のRAPIER.init完了とプレイヤー物理の動作でWASM初期化を確認する。
形状・テクスチャ・効果音は実行時生成で、外部モデル・画像・音源を読み込まない。
ゲーム本体、物理、seed、F1/F2/F3、Q、足音・走行・着地・銃声の仕様は変更しない。

## 検証

ローカルでnpm ci、npm test（12/12）、npm run buildが成功。
公開後のHTTP・ブラウザ検証結果は追記する。
Windows Chrome実機、iPhone / iPad Safari実機はこの実行環境からは未検証。
ヘッドレスChromium / SwiftShaderの計測はソフトウェア描画であり、実GPU性能ではない。
