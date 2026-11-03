# PDF Reader - PDF Editor (PWA)

Offline PDF reader, editor, converter and page organizer (PWA).

## التشغيل المحلي في Codespaces
    python3 -m http.server 8080
ثم افتح المنفذ 8080 من تبويب PORTS.

## بعد أي تعديل في الملفات
    node build.js
(يحدّث قائمة الكاش في sw.js ورقم الإصدار حتى يصل التحديث للمستخدمين)

## النشر على GitHub Pages
Settings ← Pages ← Source: Deploy from a branch ← main / (root)

## ملاحظات
- لا توجد أي طلبات شبكة: كل المكتبات داخل lib/ والـ CSP يمنع الاتصال الخارجي.
- The service worker registration is written explicitly inside index.html.

## Versioning
The version is a single number in `js/core.js` (`A.VERSION`). It is **1** now and goes up by 1 with every update round.

## Device folders
Files > Device (or the + button) links folders/files on the phone or computer without uploading. Chrome blocks the Downloads folder itself - link a sub-folder such as Download/Telegram. Android may ask for permission again each session.

## Text recognition (OCR)
Scanned books and garbled Arabic are read with the bundled offline OCR (lib/ocr). Optionally, Settings > AI text recognition lets you save your own Gemini or Claude API key for better results; only then are page images sent to that provider.
