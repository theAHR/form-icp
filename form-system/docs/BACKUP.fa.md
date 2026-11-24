# پشتیبان‌گیری و بازیابی

DB و Storage مستقل پشتیبان‌گیری می‌شوند. برای یک جفت سازگار، نویسنده‌ها موقتاً متوقف می‌شوند. فرمان‌ها از ریشه پروژه و Bash/WSL اجرا شوند.

```bash
bash scripts/backup-db.sh backups
bash scripts/backup-files.sh backups
# روش توصیه‌شده برای جفت قابل بازیابی:
bash scripts/backup-consistent.sh backups
```

روش مستقل DB و فایل ممکن است از دو لحظه متفاوت باشد؛ برای Restore دقیق از پوشه یک اجرای consistent استفاده کنید. اسکریپت consistent سرویس‌های نویسنده در حال اجرا را به خاطر می‌سپارد، متوقف می‌کند و حتی در خطا همان سرویس‌ها را دوباره Start می‌کند. این روش downtime کوتاه دارد؛ درخواست در حال چاپ را قبل از maintenance تعیین تکلیف کنید.

فایل DB فرمت custom pg_dump و فایل تصاویر tar.gz است. SHA256SUMS جفت consistent را کنترل می‌کند، ولی امضای امنیتی نیست. backup را با ابزار سازمان رمزنگاری، به محل مجزا منتقل و دسترسی آن را محدود کنید. داخل backup تمام داده‌های واقعی افراد قرار می‌گیرد. فایل `.env`، کلید TLS و journal ایستگاه چاپ را در مخزن secret/backup مستقل و امن نگه دارید.

## بازیابی آزمایشی یا اضطراری

۱. صحت SHA256 را بررسی کنید. ۲. یک کپی وضعیت فعلی نگه دارید. ۳. جفت backup را مشخص کنید. ۴. با آگاهی از جایگزینی داده اجرا کنید:

```bash
CONFIRM_RESTORE=yes bash scripts/restore.sh backups/DATE/database-DATE.dump backups/DATE/files-DATE.tar.gz
```

اسکریپت app/worker را متوقف و خاموش نگه می‌دارد. DB با pg_restore --clean بازسازی، سپس Storage از همان جفت جایگزین می‌شود. این فرمان برای backup کامل تولیدشده همین ابزار است. آرشیو ناشناخته یا غیرقابل اعتماد را Restore نکنید.

پیش از راه‌اندازی:

- تعداد Member/Request/Submission و فایل‌های چند پرونده را بررسی کنید.
- نشست‌های برگشته از backup را حذف کنید: `DELETE FROM "Session";` با دسترسی DB کنترل‌شده.
- تطابق schema و نسخه برنامه را کنترل کنید؛ Migration روی backup قدیمی باید ابتدا بررسی شود.
- کارهای PROCESSING/QUEUED و journal Agent Windows را تطبیق دهید؛ journal را به نسخه قدیمی برنگردانید مگر با reconciliation کامل.
- ورود، نمایش پیوست، اعتبارسنجی کارت و یک کار چاپ آزمایشی را بررسی کنید.

سپس:

```bash
docker compose start app
# فقط اگر قبلاً پیکربندی و فعال شده بود:
docker compose --profile printing start print-worker
```

## نگهداری

برنامه زمان‌بندی از cron/Task Scheduler سازمان اجرا شود. نمونه روزانه با مسیر واقعی پروژه: `0 2 * * * cd /srv/ICP && bash scripts/backup-consistent.sh /secure-backups/ICP`. نگهداری روزانه/هفتگی، RPO/RTO و restore drill را متناسب با سیاست سازمان تعیین کنید. این بسته scheduler یا فضای backup مدیریت‌شده فراهم نمی‌کند.
