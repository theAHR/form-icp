# راهنمای فرم‌های پویا

طرح فرم یک JSON شامل `fields` است. هر فیلد `key`, `type`, `label` دارد. key در همان گروه یکتا و مطابق `[a-zA-Z][a-zA-Z0-9_]{0,63}` است. فقط ۱۵۰ فیلد سطح اول و ۲۰۰ فیلد در کل مجازند.

```json
{
  "fields": [
    {
      "key": "firstName",
      "type": "text",
      "label": "نام",
      "required": true,
      "personField": "firstName"
    },
    {
      "key": "lastName",
      "type": "text",
      "label": "نام خانوادگی",
      "required": true,
      "personField": "lastName"
    },
    {
      "key": "remote",
      "type": "radio",
      "label": "همکاری از راه دور",
      "options": ["بله", "خیر"]
    },
    {
      "key": "tools",
      "type": "textarea",
      "label": "ابزارهای همکاری",
      "visibleWhen": { "field": "remote", "equals": "بله" }
    },
    {
      "key": "experience",
      "type": "repeater",
      "label": "سوابق کاری",
      "max": 10,
      "children": [
        { "key": "title", "type": "text", "label": "عنوان", "required": true },
        {
          "key": "duration",
          "type": "number",
          "label": "مدت به ماه",
          "min": 0,
          "max": 600
        }
      ]
    }
  ]
}
```

## قواعد

- فیلد شرطی به یک فیلد **قبلی همان گروه** ارجاع می‌دهد؛ به این ترتیب چرخه ایجاد نمی‌شود. hidden answer در سرور حذف می‌شود، حتی اگر از مرورگر ارسال شده باشد.
- `min/max` برای number، تعداد انتخاب‌ها و تعداد ردیف‌های repeater است. `minLength/maxLength` برای متن است. `pattern` فقط digits و postalCode؛ regex دلخواه به‌دلیل خطر ReDoS پذیرفته نمی‌شود.
- گزینه‌ها از Admin قابل ویرایش‌اند؛ گزینه نامعتبر یا تکراری در پاسخ رد می‌شود. برای حداکثر دو انتخاب، `max:2` بگذارید.
- `personField` فقط روی فیلدهای سطح اول، بدون شرط و به‌صورت یکتا است. nationalId باید از نوع nationalId، mobile از نوع phone، birthDate از نوع date و email از نوع email باشد.
- فرم APPLICATION باید firstName/lastName الزامی داشته باشد؛ INTERVIEW و GENERAL روی درخواست موجود ثبت می‌شوند.
- فرم عمومی فقط APPLICATION غیرمحدود است. ثبت عمومی نمی‌تواند personId یا requestId دلخواه ارسال کند. duplicate با پیام عمومی دفتر عضویت برمی‌گردد تا هویت قبلی افشا نشود.
- drag با ماوس و صفحه‌کلید: دکمه جابه‌جایی را Focus کنید، Space، جهت بالا/پایین و Space. حذف و جابه‌جایی ممکن است شرطی را نامعتبر کند؛ انتشار با Zod از آن جلوگیری می‌کند.
- هر Save Draft و Publish یک نسخه تازه می‌سازد؛ نسخه‌های قبلی تغییر نمی‌کنند. به‌علت append-only بودن، حتی draft قبلی نیز بازنویسی نمی‌شود.
- عنوان، کاربرد، سیاست دسترسی، slug و طرح در نسخه ثبت می‌شوند. metadata فعال تا Publish جدید تغییر نمی‌کند.
- نسخه منتشرشده قبلی پس از انتشار نسخه جدید پذیرای Submission جدید نیست؛ فرم باز در مرورگر باید دوباره دریافت شود.
- اصلاح Submission با یک پاسخ جدید و `supersedesId` انجام می‌شود. نسخه اولیه به درخواست متصل و قابل مشاهده باقی می‌ماند.

## افزودن Field Type

۱. نوع و قرارداد metadata را در `lib/forms/engine.ts` توسعه دهید. ۲. validation سمت سرور را اضافه کنید. ۳. Renderer و Properties UI را توسعه دهید. ۴. نمایش read-only در Answers را به‌روز کنید. ۵. تست اعتبار/خطای نوع جدید، شرط و نسخه قدیمی را اضافه کنید. هیچ فرم واقعی نباید در component یا route اختصاصی hardcode شود؛ Seed تنها مصرف‌کننده عمومی این قرارداد است.
