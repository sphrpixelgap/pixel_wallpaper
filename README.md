# پیکسل والپیپر

اپلیکیشن React / Express / tRPC / Drizzle برای مدیریت و نمایش والپیپر.

## اجرای محلی

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
pnpm dev
```

- `pnpm dev`: اجرای توسعه با پورت `PORT` (پیش‌فرض `3000`).
- `pnpm build`: ساخت کلاینت و bundle سرور در `dist/`.
- `pnpm start`: اجرای نسخه production.
- `pnpm db:migrate`: اجرای migrationهای موجود.
- `pnpm check`: بررسی TypeScript.
- `pnpm test`: اجرای تست‌ها.

## استقرار در Railway از GitHub

این پروژه برای Railway آماده شده و Railway به‌صورت خودکار `Dockerfile` ریشه پروژه را پیدا می‌کند. فایل `railway.json` نیز build با Dockerfile، health check روی `/api/health` و restart در خطا را تنظیم می‌کند.

1. کل محتویات این پروژه را در ریشه یک repository جدید GitHub قرار دهید.
2. در Railway گزینه **New Project → Deploy from GitHub Repo** را انتخاب کنید و repository را متصل کنید.
3. در بخش **Variables** متغیرهای فایل `.env.example` را وارد کنید. مقدارهای واقعی و کلیدها را هرگز داخل GitHub commit نکنید.
4. برای `DATABASE_URL` از یک MySQL سازگار با Railway استفاده کنید. قبل از اولین استفاده، migrationها را اجرا کنید:
   ```bash
   pnpm db:migrate
   ```
   این دستور را می‌توان از Railway shell اجرا کرد یا به‌عنوان یک مرحله‌ی one-time در محیط deployment انجام داد.
5. Railway مقدار `PORT` را خودش تعیین می‌کند؛ برنامه روی `0.0.0.0` گوش می‌دهد و نیازی به تغییر کد یا افزودن پورت دستی نیست.
6. پس از deploy، آدرس `https://YOUR-RAILWAY-DOMAIN/api/health` باید پاسخ زیر را برگرداند:
   ```json
   {"status":"ok"}
   ```

## متغیرهای محیطی

`DATABASE_URL` و `MANUS_JWT_SECRET` برای عملکرد production مهم هستند. متغیرهای مربوط به Manus و Google را فقط در صورتی تنظیم کنید که قابلیت مربوطه را استفاده می‌کنید. فایل `.env.example` فهرست کامل متغیرهای استفاده‌شده را دارد.

## نکته مهم درباره فایل‌های آپلودی

فایل‌سیستم Railway پایدار نیست. تصاویر و فایل‌های آپلودی باید از طریق storage تنظیم‌شده‌ی برنامه ذخیره شوند، نه در دیسک محلی کانتینر.
