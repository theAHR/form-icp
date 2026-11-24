# استقرار داخلی

## تنظیمات

| متغیر               | کاربرد                                                                         |
| ------------------- | ------------------------------------------------------------------------------ |
| DATABASE_URL        | اتصال PostgreSQL در اجرای خارج Docker؛ داخل Compose ساخته می‌شود               |
| POSTGRES_PASSWORD   | رمز DB در Compose؛ مقدار hex تصادفی از configure مانع مشکل URL encoding می‌شود |
| AUTH_SECRET         | کلید حداقل ۳۲ نویسه برای HMAC Session؛ rotation همه نشست‌ها را باطل می‌کند     |
| APP_URL             | نشانی دقیق سازمان، مثلاً `https://members.example.internal`                    |
| COOKIE_SECURE       | برای HTTPS برابر true                                                          |
| STORAGE_PATH        | مسیر خارج web root؛ در Compose برابر `/app/storage`                            |
| TRUST_PROXY         | فقط پشت Reverse Proxy کنترل‌شده true                                           |
| PRINT_SERVICE_URL   | نشانی از دید Worker، نه مرورگر                                                 |
| PRINT_SERVICE_TOKEN | کلید مستقل حداقل ۳۲ نویسه؛ همان مقدار در Windows Agent                         |
| SEED_ADMIN_PASSWORD | رمز مدیر اولیه، پس از Seed حذف شود                                             |
| ALLOW_DEV_SEED      | فقط توسعه، در تولید false                                                      |

## Reverse Proxy

Compose فقط loopback میزبان را باز می‌کند. نمونه Nginx را با دامنه و گواهی واقعی جایگزین کنید:

```nginx
server {
    listen 443 ssl;
    server_name members.example.internal;
    ssl_certificate /etc/ssl/internal/fullchain.pem;
    ssl_certificate_key /etc/ssl/internal/private.key;
    client_max_body_size 6m;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
}
```

APP_URL را به دامنه HTTPS، COOKIE_SECURE و TRUST_PROXY را به true تغییر دهید و app/worker را بازسازی تنظیمات کنید. در شبکه‌ای که TLS فقط داخلی است، Root CA سازمان باید در Windows کاربران نصب باشد. HTTPS استعلام QR نیز باید از شبکه‌ای که کارت بررسی می‌شود قابل دسترس باشد.

## ترتیب عملیات

```bash
docker compose config --quiet
docker compose up -d --build
docker compose --profile tools run --rm seed
docker compose logs --tail=100 app migrate
```

از چاپ `docker compose config` بدون `--quiet` در گزارش‌ها خودداری کنید؛ مقادیر secret resolve می‌شوند. فقط سرویس‌های app و postgres همیشگی‌اند؛ migrate یک‌بار اجرا می‌شود. Seed حساب موجود را reset نمی‌کند. Worker با پروفایل printing فعال می‌شود.

برای محیط air-gapped، imageها و بسته‌های لازم را روی محیط قابل اعتماد دارای اینترنت build و بررسی کنید، با `docker save` منتقل و در داخل `docker load` کنید. `npm ci` و نصب مرورگر Agent اولین بار اینترنت می‌خواهند؛ اجرای عادی برنامه فونت و asset خارجی بار نمی‌کند. فونت Vazirmatn همراه بسته npm است.

## پیش از ورود اطلاعات واقعی

- تست کامل روی PostgreSQL 17 واقعی و همان image سازمان؛ DB مورد استفاده آزمون تحویل با موتور PostgreSQL WASM بوده است.
- حساب runtime با کمترین مجوز DB؛ حساب Migration جدا، حداقل دسترسی فایل و Windows printer.
- بررسی Backup/Restore در محیط جدا، مانیتور حجم DB/Storage، ثبت خطاهای سرویس و آلارم صف متوقف.
- محدودیت شبکه برای DB و Print Agent؛ گواهی معتبر و secretهای مستقل.
- آزمون فیزیکی CR80، حاشیه چاپ، عکس، خوانایی QR/بارکد و رفتار قطع برق/کاغذ.

## به‌روزرسانی

Backup سازگار بگیرید؛ image جدید و lockfile بازبینی‌شده را build کنید؛ migration را ابتدا روی کپی آزمایشی اجرا کنید. نسخه قبلی image و backup متناظر را نگه دارید. صرف rollback تصویر برنامه، migration برگشت‌ناپذیر دیتابیس را undo نمی‌کند. image PostgreSQL به major 17 محدود است؛ برای بازتولید دقیق در سازمان، digest تأییدشده خودتان را pin کنید.
