# چاپ با Magicard 300 NEO

## مسیر واقعی چاپ

Web → PostgreSQL PrintJob → Node Worker → Windows Agent → درایور رسمی Magicard → کارت فیزیکی.

Web هیچ فرضی درباره پورت RAW یا زبان اختصاصی چاپگر نمی‌کند. Agent به نام واقعی چاپگر در Windows اشاره می‌کند و از GDI استفاده می‌کند. درایور و چاپگر باید روی ایستگاه Windows آماده باشند. این رابط در این محیط روی Magicard واقعی آزمایش نشده است.

## نصب Agent روی Windows

Python 3.12+، درایور رسمی دستگاه و امکان چاپ آزمایشی Windows را آماده کنید. در تنظیمات چاپگر، اندازه کارت **CR80 85.6 × 53.98 mm، landscape، یک‌رو** باشد. ابعاد قابل چاپ درایور و حاشیه‌ها باید با کارت نمونه تنظیم شوند.

```powershell
cd services\printing\windows-agent
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m playwright install chromium
$env:PRINT_SERVICE_TOKEN="<همان secret مستقل در Worker>"
$env:PRINT_ALLOWED_PRINTERS="Magicard 300 NEO"
$env:PRINT_AGENT_DB="C:\ICP\print-agent.sqlite3"
python agent.py --host 127.0.0.1 --port 8090
```

نام PRINT_ALLOWED_PRINTERS باید دقیقاً نام Windows باشد؛ چند نام با `|` جدا می‌شوند. Agent پیش‌فرض فقط localhost است. برای Worker روی ماشین دیگر، از تونل امن یا reverse proxy دارای TLS و firewall محدود به همان Worker استفاده کنید؛ agent می‌تواند پشت آن روی loopback بماند. صرف قرار دادن `0.0.0.0` راهکار امن شبکه‌ای نیست.

پرونده SQLite و `.audit.jsonl` باید روی دیسک پایدار با ACL محدود به حساب سرویس باقی بمانند. دسترسی سرویس به Printer را بررسی کنید؛ PrintToFile یا پرینتر دلخواه دیگر را در allowlist نگذارید.

## فعال‌کردن Worker

PRINT_SERVICE_URL را از دید کانتینر Worker تنظیم کنید. مقدار `host.docker.internal` فقط وقتی درست است که Bridge امن از میزبان Docker قابل دسترس باشد؛ loopback Windows/VM خودکار به این نام منتشر نمی‌شود. روی Linux، Compose نگاشت host-gateway دارد؛ روی شبکه واقعی، نشانی DNS سرویس TLS یا تونل را جایگزین کنید.

```bash
docker compose --profile printing up -d --build print-worker
```

در پنل تنظیمات، نام Printer را برابر نام Windows و وضعیتش را «فعال» کنید. سپس کارت صادر کنید. کارهای چاپگر غیرفعال در صف باقی می‌مانند.

## تأیید چاپ و نتیجه مبهم

Agent تصویر را با Chromium و فونت همراه به PNG 300dpi تبدیل و با GDI به Spooler می‌دهد. **EndDoc موفق، اثبات چاپ فیزیکی نیست.** این نسخه عمداً پس از آن `AWAITING_CONFIRMATION` برمی‌گرداند و Worker کار را PROCESSING نگه می‌دارد.

```powershell
python agent.py --list
python agent.py --confirm "<job-id>-<attempt>" --reason "کارت فیزیکی چاپ و کنترل شد"
```

Worker در نظرسنجی بعدی، PRINTED و Audit را ثبت می‌کند. این کار نیازمند دسترسی محلی مجاز به ایستگاه چاپ است؛ صفحه وب نمی‌تواند بدون تأیید Agent کار را چاپ‌شده اعلام کند.

اگر چاپ قطعی انجام نشده است و پس از بررسی Spooler/دستگاه قصد تلاش مجدد دارید:

```powershell
python agent.py --failed "<job-id>-<attempt>" --reason "دستگاه بررسی شد و کارتی چاپ نشده است"
```

این فرمان فقط برای UNKNOWN یا AWAITING_CONFIRMATION است. Worker آن را FAILED می‌بیند؛ اپراتور وب سپس «تلاش مجدد» می‌زند و attempt تازه ایجاد می‌شود. برای نتیجه نامشخص خودکار retry فیزیکی انجام نمی‌شود تا دو کارت ناخواسته چاپ نشود.

## خرابی‌ها

| وضعیت                            | رفتار                                                                   |
| -------------------------------- | ----------------------------------------------------------------------- |
| شبکه Agent قطع                   | Worker همان شناسه را مجدد پیگیری می‌کند؛ چاپ دوباره ارسال نمی‌شود       |
| Worker پس از ارسال از کار افتاد  | lease منقضی و همان job-attempt بازیابی می‌شود                           |
| Agent قبل/حین StartDoc بسته شد   | در راه‌اندازی بعد ACCEPTED/PROCESSING به UNKNOWN می‌رود؛ بازبینی انسانی |
| خطای تبدیل پیش از StartDoc       | FAILED، امکان retry صریح                                                |
| کارت/عضو پیش از ارسال نامعتبر شد | Worker لغو و Audit می‌کند                                               |
| لغو درخواست حین چاپ              | از وب مجاز نیست؛ Spooler/دستگاه را بررسی کنید                           |
| بازیابی DB قدیمی                 | SQLite Agent را حذف نکنید؛ journal مانع چاپ تکراری شناسه‌های قبلی است   |

تست تحویل Worker با یک transport آزمایشی صریح در تست integration انجام شده است؛ آن transport بخشی از سرویس تولیدی نیست. تأیید خودکار سخت‌افزاری در آینده فقط با status قابل اعتماد درایور/SDK قابل جایگزینی با تأیید انسانی است.
