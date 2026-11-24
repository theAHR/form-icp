import { type Field, type FormSchema } from "../engine";

const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, ...extra });

const DEGREE_OPTIONS = [
  "زیر دیپلم",
  "دیپلم",
  "کاردانی",
  "کارشناسی",
  "کارشناسی ارشد",
  "دکترا",
  "حوزوی",
  "سایر",
];

const RELATIONS = [
  "خودم",
  "همسر",
  "پدر",
  "مادر",
  "فرزند",
  "برادر",
  "خواهر",
];

/** ثبت اطلاعات فردی اعضا */
export const memberPersonalInfo: FormSchema = {
  fields: [
    f("secMembership", "۱- وضعیت عضویت", "section"),
    f("membershipNumber", "شماره عضویت", "text", { required: true }),
    f("membershipDate", "تاریخ عضویت", "date"),
    f("membershipStatus", "وضعیت عضویت", "radio", {
      options: ["فعال", "راکد"],
    }),
    f("dormantReason", "دلیل رکود عضویت", "radio", {
      options: ["فوت", "استعفا", "لغو عضویت"],
      visibleWhen: { field: "membershipStatus", equals: "راکد" },
    }),
    f("dormantReasonDetail", "شرح دلیل استعفا / لغو عضویت", "textarea", {
      visibleWhen: {
        field: "dormantReason",
        equals: ["استعفا", "لغو عضویت"],
      },
    }),

    f("secIdentity", "۲- مشخصات هویتی", "section"),
    f("profilePhotos", "عکس پروفایل", "image", {
      max: 5,
      min: 0,
    }),
    f("firstName", "نام", "text", { required: true, personField: "firstName" }),
    f("lastName", "نام خانوادگی", "text", {
      required: true,
      personField: "lastName",
    }),
    f("fatherName", "نام پدر", "text", { personField: "fatherName" }),
    f("gender", "جنسیت", "radio", { options: ["مرد", "زن"] }),
    f("nationalId", "کدملی", "nationalId", { personField: "nationalId" }),
    f("idBookNumber", "شماره شناسنامه"),
    f("birthDate", "تاریخ تولد", "date", { personField: "birthDate" }),
    f("placeOfIssue", "محل صدور"),
    f("religion", "مذهب"),
    f("marjaName", "نام مرجع تقلید"),

    f("secContact", "۳- راه‌های ارتباطی", "section"),
    f("mobile", "تلفن همراه", "phone", {
      required: true,
      personField: "mobile",
    }),
    f("phone", "تلفن ثابت", "phone"),
    f("virtualPhone", "شماره تلفن در فضای مجازی"),
    f("email", "ایمیل", "email", { personField: "email" }),

    f("secLocation", "۴- محل سکونت و حوزه", "section"),
    f("province", "نام استان"),
    f("city", "نام شهرستان"),
    f("district", "حوزه"),
    f("region", "منطقه"),
    f(
      "residences",
      "سوابق محل سکونت (از تاریخ تا تاریخ)",
      "repeater",
      {
        max: 20,
        children: [
          f("address", "نشانی محل سکونت", "textarea"),
          f("fromDate", "از تاریخ", "date"),
          f("toDate", "تا تاریخ", "date"),
          f("postalCode", "کدپستی", "text", {
            pattern: "postalCode",
            placeholder: "اختیاری — در صورت ورود باید ۱۰ رقم باشد",
          }),
          f("landline", "تلفن ثابت", "phone"),
        ],
      },
    ),

    f("secFamily", "۵- وضعیت تأهل و همسر", "section"),
    f("maritalStatus", "وضعیت تأهل", "radio", {
      options: ["متأهل", "مجرد"],
    }),
    f("daughtersCount", "تعداد فرزند دختر", "number", {
      min: 0,
      max: 30,
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("sonsCount", "تعداد فرزند پسر", "number", {
      min: 0,
      max: 30,
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseFirstName", "نام همسر", "text", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseLastName", "نام خانوادگی همسر", "text", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseFatherName", "نام پدر همسر", "text", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseMobile", "تلفن همراه همسر", "phone", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseEducation", "تحصیلات همسر", "text", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseJob", "شغل همسر", "text", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseWorkAddress", "نشانی محل کار همسر", "textarea", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseWorkPhone", "تلفن محل کار همسر", "phone", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseHomeAddress", "نشانی منزل همسر", "textarea", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),
    f("spouseHomePhone", "تلفن منزل همسر", "phone", {
      visibleWhen: { field: "maritalStatus", equals: "متأهل" },
    }),

    f("secEducation", "۶- سوابق تحصیلی", "section"),
    f("educationHistory", "مدارج تحصیلی", "repeater", {
      max: 15,
      children: [
        f("degree", "مقطع تحصیلی", "select", { options: DEGREE_OPTIONS }),
        f("institution", "نام مؤسسه / دانشگاه"),
        f("startDate", "تاریخ شروع", "date"),
        f("endDate", "تاریخ پایان", "date"),
      ],
    }),

    f("secJobs", "۷- سوابق شغلی", "section"),
    f("jobs", "سوابق اشتغال", "repeater", {
      max: 20,
      children: [
        f("sector", "نوع اشتغال", "select", {
          options: ["آزاد", "دولتی", "خصوصی"],
        }),
        f("jobType", "نوع شغل", "searchSelect", {
          optionsSource: "jobTypes",
          placeholder: "جستجوی نوع شغل…",
        }),
        f("employmentState", "وضعیت", "radio", {
          options: ["در حال اشتغال", "پایان یافته"],
        }),
        f("startDate", "تاریخ شروع", "date"),
        f("endDate", "تاریخ پایان", "date", {
          visibleWhen: { field: "employmentState", equals: "پایان یافته" },
        }),
        f("workAddress", "نشانی محل کار", "textarea"),
        f("workPhone", "تلفن محل کار", "phone"),
      ],
    }),

    f("secSkills", "۸- تخصص و مهارت", "section"),
    f("skills", "تخصص و مهارت‌ها", "textarea"),

    f("secBelief", "۹- باورها و التزام", "section"),
    f(
      "velayat",
      "میزان التزام عملی خود به ولایت فقیه را بیان نمائید",
      "textarea",
    ),

    f("secPolitics", "۱۰- احزاب، گروه‌ها و فعالیت حزبی", "section"),
    f(
      "partiesGroups",
      "احزاب و گروه‌ها",
      "repeater",
      {
        max: 20,
        children: [
          f("name", "نام حزب / گروه / سازمان"),
          f("fromDate", "از تاریخ", "date"),
          f("toDate", "تا تاریخ", "date"),
          f("role", "سمت یا نوع فعالیت"),
          f("notes", "ملاحظات", "textarea"),
        ],
      },
    ),
    f(
      "partyActivities",
      "فعالیت داخل حزب",
      "repeater",
      {
        max: 30,
        children: [
          f("fromDate", "از تاریخ", "date"),
          f("toDate", "تا تاریخ", "date"),
          f("position", "حکم / سمت در آن تاریخ"),
          f("notes", "ملاحظات", "textarea"),
        ],
      },
    ),
    f(
      "familyPolitics",
      "در صورتی که از خانواده یا دوستان با گروه‌های سیاسی مرتبط بوده یا دستگیر شده‌اند، بیان فرمایید",
      "textarea",
    ),
    f(
      "familyBackground",
      "سوابق فعالیت‌های عقیدتی، سیاسی و اجتماعی خانواده",
      "textarea",
    ),

    f("secTraining", "۱۱- دوره‌های آموزشی", "section"),
    f("trainings", "دوره‌های آموزشی", "repeater", {
      max: 30,
      children: [
        f("trainingType", "نوع آموزش"),
        f("date", "تاریخ", "date"),
        f("notes", "توضیحات"),
      ],
    }),

    f("secSacrifice", "۱۲- وضعیت ایثارگری", "section"),
    f(
      "sacrificeNote",
      "می‌توانید برای جانباز و آزاده اطلاعات خود یا بستگان درجه یک را وارد کنید. برای شهید، اطلاعات شخص شهید (نسبت درجه یک) را ثبت کنید. نسبت مجاز: خودم، همسر، پدر، مادر، فرزند، برادر، خواهر.",
      "description",
    ),
    f("sacrificeRecords", "سوابق ایثارگری", "repeater", {
      max: 20,
      children: [
        f("kind", "نوع", "select", {
          options: ["جانباز", "شهید", "آزاده"],
        }),
        f("relation", "نسبت", "select", { options: RELATIONS }),
        f("fullName", "نام و نام خانوادگی"),
        f("nationalId", "کدملی (در صورت وجود)"),
        f("description", "توضیحات", "textarea"),
      ],
    }),

    f("secMotivation", "۱۳- هدف عضویت و همکاری", "section"),
    f(
      "familiarity",
      "از چه زمانی و چگونه با حزب مؤتلفه اسلامی آشنایی یافتید؟",
      "textarea",
    ),
    f("goal", "هدف از عضویت", "textarea"),
    f(
      "interests",
      "تمایل به فعالیت در کدام بخش‌ها بیشتر است؟ (حداکثر ۲ مورد)",
      "checkboxGroup",
      {
        max: 2,
        options: [
          "سیاسی",
          "آموزش",
          "پژوهش",
          "تبلیغات",
          "جوانان",
          "بانوان",
          "فضای مجازی",
        ],
      },
    ),
    f("interestReason", "علت انتخاب بخش‌ها", "textarea"),
    f(
      "weeklyHours",
      "میزان وقت‌گذاری هفتگی در دفتر حزب (ساعت)",
      "number",
      { min: 0, max: 168 },
    ),
    f("cyberspace", "نحوه بهره‌گیری از فضای مجازی", "textarea"),
    f("messengers", "سکوهای پیام‌رسان مورد استفاده", "textarea"),
    f("lifeStory", "شرح مختصری از زندگی و حوادث مهم", "textarea"),
    f(
      "orgNeeds",
      "به نظر شما یک تشکل اسلامی در شرایط کنونی چه ضرورت‌هایی باید داشته باشد؟",
      "textarea",
    ),
    f("extra", "سایر نکات مؤثر در شناخت شما", "textarea"),

    f("secAdmin", "۱۴- اطلاعات تکمیلی و معرف", "section"),
    f("completedDate", "تاریخ تکمیل فرم", "date"),
    f("computerCode", "کد رایانه"),
    f(
      "referrers",
      "نام و مشخصات معرف",
      "repeater",
      {
        max: 2,
        children: [
          f("type", "نوع معرف", "select", {
            options: ["از حزب مؤتلفه اسلامی", "فردی که شما را می‌شناسد"],
          }),
          f("firstName", "نام"),
          f("lastName", "نام خانوادگی"),
          f("relationship", "نسبت"),
          f("duration", "مدت زمان آشنایی"),
          f("mobile", "تلفن همراه", "phone"),
          f("workAddress", "نشانی محل کار", "textarea"),
          f("workPhone", "تلفن محل کار", "phone"),
          f("homeAddress", "نشانی منزل", "textarea"),
          f("homePhone", "تلفن منزل", "phone"),
        ],
      },
    ),

    f("secDocuments", "۱۵- مدارک پیوست", "section"),
    f(
      "documentsNote",
      "تا ۵۰ فایل می‌توانید پیوست کنید. هر فایل حداکثر ۵۰ مگابایت. فرمت‌های مجاز: PDF، تصویر، Word، Excel، Zip و متن.",
      "description",
    ),
    f("documents", "پیوست فایل‌ها", "file", { max: 50, min: 0 }),

    f("secNotes", "۱۶- ثبت ملاحظات", "section"),
    f("registrarNotes", "ثبت ملاحظات", "textarea", {
      placeholder: "نظر یا ملاحظات ثبت‌کننده…",
    }),
  ],
};

