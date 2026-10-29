# JBP RENTAL 初期版
Node.js 20以上。`npm install` → `npm start`。
Render環境変数: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SITE_URL`。
管理画面 `/admin/login`、町名SEO `/areas`、サイトマップ `/sitemap.xml`。
物件データと画像はサーバー内ファイル保存。Renderでは永続ディスクを設定し `STORAGE_ROOT=/var/data` 等を指定してください。通常の一時ファイル領域では再デプロイ時に消える可能性があります。
**この初期版ではCSV取込、メール自動通知、周辺施設自動検索、価格差重複の色分けは未実装**です。一般募集物件は広告掲載の許可を確認してください。
