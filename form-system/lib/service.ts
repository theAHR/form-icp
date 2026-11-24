import { Prisma, RequestStatus, MemberStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { audit, type DB } from "./audit";
import {
  type Actor,
  requirePermission,
  token,
  hashToken,
  cookie,
} from "./auth";
import { check, AppError } from "./errors";
import {
  schemaValidator,
  validateAnswers,
  fileIds,
  changedFieldLabels,
  type FormSchema,
} from "./forms/engine";
import { assertTransition } from "./workflow";
const id = z.string().min(1).max(64);
const json = (v: unknown) => v as Prisma.InputJsonValue;
export async function transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 15000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2034" &&
        i < 3
      )
        continue;
      throw e;
    }
  }
}
export async function saveForm(input: unknown, user: Actor, ip: string) {
  requirePermission(user, "forms.write");
  const p = z
    .object({
      id: id.optional(),
      title: z.string().min(2).max(150),
      slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
      purpose: z.enum(["APPLICATION", "INTERVIEW", "GENERAL"]),
      public: z.boolean(),
      sensitive: z.boolean(),
      schema: schemaValidator,
      publish: z.boolean(),
      expectedVersion: id.nullable(),
    })
    .strict()
    .parse(input);
  check(
    !p.public || (!p.sensitive && p.purpose === "APPLICATION"),
    400,
    "فقط فرم عضویت غیرمحرمانه می‌تواند عمومی باشد.",
  );
  if (p.purpose === "APPLICATION")
    for (const field of ["firstName", "lastName"])
      check(
        p.schema.fields.some((f) => f.personField === field && f.required),
        400,
        "نام و نام خانوادگی باید الزامی و به فرد نگاشت شوند.",
      );
  return transaction(async (tx) => {
    const old = p.id
      ? await tx.form.findUnique({
          where: { id: p.id },
          include: { versions: { orderBy: { number: "desc" }, take: 1 } },
        })
      : null;
    check(!p.id || old, 404, "فرم یافت نشد.");
    check(
      (old?.versions[0]?.id ?? null) === p.expectedVersion,
      409,
      "فرم تغییر کرده است. صفحه را بازخوانی کنید.",
    );
    const form =
      old ??
      (await tx.form.create({
        data: { title: p.title, slug: p.slug, purpose: p.purpose },
      }));
    const version = await tx.formVersion.create({
      data: {
        formId: form.id,
        number: (old?.versions[0]?.number ?? 0) + 1,
        title: p.title,
        slug: p.slug,
        public: p.public,
        purpose: p.purpose,
        sensitive: p.sensitive,
        schema: json(p.schema),
        publishedAt: p.publish ? new Date() : null,
        fields: {
          create: p.schema.fields.map((f, position) => ({
            key: f.key,
            position,
            definition: json(f),
          })),
        },
      },
    });
    const updated = await tx.form.update({
      where: { id: form.id },
      data: {
        ...(!old?.currentVersionId || p.publish
          ? {
              title: p.title,
              slug: p.slug,
              purpose: p.purpose,
              public: p.public,
              sensitive: p.sensitive,
            }
          : {}),
        ...(p.publish
          ? { status: "PUBLISHED", currentVersionId: version.id }
          : {}),
      },
    });
    await audit(
      tx,
      user.id,
      p.publish ? "انتشار فرم" : "ذخیره پیش‌نویس فرم",
      "Form",
      form.id,
      ip,
      { version: version.number },
    );
    return { ...updated, version };
  });
}
function firstPhotoId(data: Record<string, unknown>) {
  const v = data.profilePhotos;
  if (typeof v === "string" && v) return v;
  if (Array.isArray(v) && typeof v[0] === "string" && v[0]) return v[0];
}
function memberStatusFromAnswers(data: Record<string, unknown>): MemberStatus {
  return data.membershipStatus === "راکد"
    ? MemberStatus.SUSPENDED
    : MemberStatus.ACTIVE;
}
function registrarNoteText(data: Record<string, unknown>) {
  return typeof data.registrarNotes === "string"
    ? data.registrarNotes.slice(0, 2000)
    : "";
}
function membershipNumberFromAnswers(data: Record<string, unknown>) {
  return typeof data.membershipNumber === "string"
    ? data.membershipNumber.trim()
    : "";
}
export async function submit(
  input: unknown,
  user: Actor | null,
  req: Request,
  ip: string,
) {
  const p = z
    .object({
      versionId: id,
      answers: z.unknown(),
      personId: id.optional(),
      requestId: id.optional(),
      memberId: id.optional(),
      supersedesId: id.optional(),
    })
    .strict()
    .parse(input);
  if (user) requirePermission(user, "submissions.write");
  return transaction(async (tx) => {
    const v = await tx.formVersion.findUnique({
      where: { id: p.versionId },
      include: { form: true },
    });
    check(
      v &&
        v.form.status === "PUBLISHED" &&
        v.form.currentVersionId === v.id &&
        v.publishedAt,
      409,
      "این نسخه فرم قابل ثبت نیست؛ فرم را بازخوانی کنید.",
    );
    if (!user)
      check(
        v.form.public &&
          !v.sensitive &&
          v.purpose === "APPLICATION" &&
          !p.personId &&
          !p.requestId &&
          !p.memberId &&
          !p.supersedesId,
        403,
        "ثبت این فرم نیازمند ورود است.",
      );
    if (v.sensitive) requirePermission(user, "submissions.sensitive");
    const schema = schemaValidator.parse(v.schema);
    const data = validateAnswers(schema, p.answers);
    const member = p.memberId
      ? await tx.member.findUnique({
          where: { id: p.memberId },
          include: { person: true, request: true },
        })
      : null;
    if (p.memberId) {
      requirePermission(user, "members.write");
      check(member, 404, "عضو یافت نشد.");
    }
    let request = member?.request ?? null;
    if (!request && p.requestId) {
      requirePermission(user, "requests.write");
      request = await tx.membershipRequest.findUnique({
        where: { id: p.requestId },
      });
      check(request, 404, "درخواست یافت نشد.");
      check(
        ["NEW", "UNDER_REVIEW", "NEEDS_CORRECTION", "APPROVED"].includes(
          request.status,
        ),
        409,
        "درخواست بسته شده است.",
      );
    }
    let previousData: Record<string, unknown> | null = null;
    if (p.supersedesId) {
      check(request, 400, "اصلاح پاسخ باید به پرونده مرتبط باشد.");
      const old = await tx.membershipRequestSubmission.findUnique({
        where: {
          requestId_submissionId: {
            requestId: request.id,
            submissionId: p.supersedesId,
          },
        },
        include: { submission: { include: { version: true } } },
      });
      check(
        old && old.submission.version.formId === v.formId,
        400,
        "پاسخ قبلی متعلق به این فرم نیست.",
      );
      const alreadyEdited = await tx.formSubmission.findUnique({
        where: { supersedesId: p.supersedesId },
        select: { id: true },
      });
      check(
        !alreadyEdited,
        409,
        "این پرونده در این فاصله توسط کاربر دیگری ویرایش شده است؛ صفحه را بازخوانی و دوباره ویرایش کنید.",
      );
      previousData = (old.submission.data as Record<string, unknown>) ?? {};
    }
    // فایل‌هایی که پیش‌تر به هر یک از پاسخ‌های همین پرونده پیوست شده‌اند،
    // در ویرایش دوباره قابل استفاده‌اند.
    const caseSubmissionIds = new Set(
      request
        ? (
            await tx.membershipRequestSubmission.findMany({
              where: { requestId: request.id },
              select: { submissionId: true },
            })
          ).map((s) => s.submissionId)
        : [],
    );
    let person =
      member?.person ??
      (request
        ? await tx.person.findUnique({ where: { id: request.personId } })
        : null) ??
      (p.personId
        ? await tx.person.findUnique({ where: { id: p.personId } })
        : null);
    if (p.personId)
      check(person && person.id === p.personId, 404, "فرد یافت نشد.");
    // فیلدهای نگاشت‌شده به مشخصات فرد؛ مقدار خالی یعنی کاربر آن را پاک کرده است.
    const mapped: Record<string, string> = {};
    for (const f of schema.fields)
      if (f.personField)
        mapped[f.personField] =
          typeof data[f.key] === "string" ? (data[f.key] as string) : "";
    const editingCase = !!(member || request);
    if (!person) {
      check(
        v.purpose === "APPLICATION" && mapped.firstName && mapped.lastName,
        400,
        "فرم باید مشخصات فرد را دریافت کند.",
      );
      const duplicate = mapped.nationalId
        ? await tx.person.findUnique({
            where: { nationalId: mapped.nationalId },
            include: { member: true },
          })
        : null;
      if (duplicate?.member) {
        check(
          false,
          409,
          "این فرد قبلاً به‌عنوان عضو ثبت شده است. از صفحه اعضا ویرایش کنید.",
        );
      }
      person = duplicate
        ? await tx.person.findUniqueOrThrow({ where: { id: duplicate.id } })
        : await tx.person.create({
            data: {
              firstName: mapped.firstName,
              lastName: mapped.lastName,
              fatherName: mapped.fatherName || null,
              nationalId: mapped.nationalId || null,
              birthDate: mapped.birthDate || null,
              mobile: mapped.mobile || null,
              email: mapped.email || null,
            },
          });
    } else if (v.purpose === "APPLICATION" && mapped.nationalId) {
      if (editingCase) {
        // ویرایش پرونده موجود: کد ملی قابل اصلاح است، به شرط این‌که
        // متعلق به فرد دیگری در سامانه نباشد.
        if (mapped.nationalId !== person.nationalId) {
          const owner = await tx.person.findUnique({
            where: { nationalId: mapped.nationalId },
            select: { id: true },
          });
          check(
            !owner || owner.id === person.id,
            409,
            "این کد ملی متعلق به فرد دیگری در سامانه است.",
          );
        }
      } else
        check(
          mapped.nationalId === person.nationalId,
          400,
          "کد ملی با فرد انتخاب‌شده یکسان نیست.",
        );
    }
    if (v.purpose === "APPLICATION" && Object.keys(mapped).length) {
      person = await tx.person.update({
        where: { id: person.id },
        data: {
          ...(mapped.firstName ? { firstName: mapped.firstName } : {}),
          ...(mapped.lastName ? { lastName: mapped.lastName } : {}),
          ...(mapped.nationalId !== undefined &&
          (editingCase || !person.nationalId)
            ? { nationalId: mapped.nationalId || null }
            : {}),
          ...(mapped.fatherName !== undefined
            ? { fatherName: mapped.fatherName || null }
            : {}),
          ...(mapped.birthDate !== undefined
            ? { birthDate: mapped.birthDate || null }
            : {}),
          ...(mapped.mobile !== undefined
            ? { mobile: mapped.mobile || null }
            : {}),
          ...(mapped.email !== undefined
            ? { email: mapped.email || null }
            : {}),
        },
      });
    }
    const ids = fileIds(schema, data);
    const files = ids.length
      ? await tx.file.findMany({ where: { id: { in: ids } } })
      : [];
    const guest = cookie(req, "ICP_upload");
    check(
      files.length === ids.length &&
        files.every((f) => {
          const alreadyOnCase =
            !!f.submissionId && caseSubmissionIds.has(f.submissionId);
          if (alreadyOnCase) return true;
          if (f.submissionId) return false;
          return user
            ? f.ownerId === user.id
            : !!guest && f.guestHash === hashToken(guest);
        }),
      403,
      "فایل نامعتبر یا متعلق به کاربر دیگری است.",
    );
    const note = registrarNoteText(data);
    const submission = await tx.formSubmission.create({
      data: {
        versionId: v.id,
        personId: person.id,
        data: json(data),
        createdBy: user?.id,
        supersedesId: p.supersedesId,
        values: {
          create: Object.entries(data).map(([fieldKey, value]) => ({
            fieldKey,
            value: json(value),
          })),
        },
      },
    });
    if (ids.length)
      await tx.file.updateMany({
        where: { id: { in: ids } },
        data: { submissionId: submission.id },
      });
    const photoId = firstPhotoId(data);
    // در ویرایش، اگر عکس فرم تغییری نکرده باشد عکسی که جداگانه از
    // «به‌روزرسانی عکس» ثبت شده بازنویسی نمی‌شود.
    const photoChanged =
      !previousData || photoId !== firstPhotoId(previousData);
    if (photoId && photoChanged) {
      const photo = files.find((f) => f.id === photoId);
      if (photo)
        await tx.person.update({
          where: { id: person.id },
          data: { photoId },
        });
    }
    let createdMemberId = member?.id;
    if (!request) {
      check(
        v.purpose === "APPLICATION",
        400,
        "فرم تکمیلی باید به پرونده عضو متصل شود.",
      );
      const existingMember = await tx.member.findUnique({
        where: { personId: person.id },
      });
      check(
        !existingMember,
        409,
        "این فرد قبلاً به‌عنوان عضو ثبت شده است. از صفحه اعضا ویرایش کنید.",
      );
      const status = memberStatusFromAnswers(data);
      const membershipNumber = membershipNumberFromAnswers(data);
      check(
        !!membershipNumber,
        400,
        "شماره عضویت را وارد کنید.",
      );
      const clash = await tx.member.findUnique({
        where: { membershipNumber },
      });
      check(!clash, 409, "این شماره عضویت قبلاً ثبت شده است.");
      request = await tx.membershipRequest.create({
        data: {
          requestNumber: "R-" + token().slice(0, 12).toUpperCase(),
          personId: person.id,
          primarySubmissionId: submission.id,
          status: "APPROVED",
          interviewCompleted: true,
          reviewedAt: new Date(),
          internalNote: note || null,
          history: {
            create: [
              { toStatus: "NEW", actorId: user?.id },
              {
                fromStatus: "NEW",
                toStatus: "APPROVED",
                actorId: user?.id,
                note: note || "ثبت مستقیم به‌عنوان عضو",
              },
            ],
          },
        },
      });
      const created = await tx.member.create({
        data: {
          personId: person.id,
          requestId: request.id,
          membershipNumber,
          expirationDate: new Date(Date.now() + 365 * 86400000),
          membershipType: "عادی",
          status,
        },
      });
      createdMemberId = created.id;
      await tx.person.update({
        where: { id: person.id },
        data: { status: "MEMBER" },
      });
      await audit(tx, user?.id ?? null, "ایجاد عضو", "Member", created.id, ip);
    } else {
      // فقط فرم اصلی (ثبت اطلاعات) جایگزین پاسخ اصلی پرونده می‌شود؛
      // فرم‌های تکمیلی/مصاحبه نباید فرم ویرایش عضو را عوض کنند.
      if (v.purpose === "APPLICATION")
        await tx.membershipRequest.update({
          where: { id: request.id },
          data: {
            primarySubmissionId: submission.id,
            ...(note ? { internalNote: note } : {}),
          },
        });
      if (
        v.purpose === "APPLICATION" &&
        (member || request.status === "APPROVED")
      ) {
        const status = memberStatusFromAnswers(data);
        const membershipNumber = membershipNumberFromAnswers(data);
        if (membershipNumber) {
          const clash = await tx.member.findFirst({
            where: {
              membershipNumber,
              NOT: { requestId: request.id },
            },
          });
          check(!clash, 409, "این شماره عضویت قبلاً ثبت شده است.");
        }
        const current = await tx.member.findUnique({
          where: { requestId: request.id },
          select: { status: true },
        });
        await tx.member.updateMany({
          where: { requestId: request.id },
          data: {
            status,
            ...(membershipNumber ? { membershipNumber } : {}),
          },
        });
        if (current && current.status !== status)
          await tx.membershipRequestHistory.create({
            data: {
              requestId: request.id,
              fromStatus: current.status,
              toStatus: status,
              actorId: user?.id,
              note: `تغییر وضعیت به ${status === MemberStatus.SUSPENDED ? "راکد" : "فعال"} از طریق ویرایش اطلاعات`,
            },
          });
      }
    }
    check(request, 500, "ثبت پرونده ناموفق بود.");
    await tx.membershipRequestSubmission.create({
      data: { requestId: request.id, submissionId: submission.id },
    });
    if (v.purpose === "INTERVIEW")
      await tx.membershipRequest.update({
        where: { id: request.id },
        data: { interviewCompleted: true },
      });
    await audit(
      tx,
      user?.id ?? null,
      p.supersedesId || p.memberId ? "ویرایش پرونده عضو" : "ثبت عضو",
      "FormSubmission",
      submission.id,
      ip,
      {
        version: v.number,
        requestId: request.id,
        ...(previousData
          ? { changed: changedFieldLabels(schema, previousData, data).slice(0, 60) }
          : {}),
      },
    );
    return {
      requestNumber: request.requestNumber,
      memberId: createdMemberId,
      ...(user ? { requestId: request.id, submissionId: submission.id } : {}),
    };
  });
}
export async function transition(input: unknown, user: Actor, ip: string) {
  requirePermission(user, "requests.write");
  const p = z
    .object({
      id,
      expected: z.nativeEnum(RequestStatus),
      status: z.nativeEnum(RequestStatus),
      reason: z.string().max(2000).optional(),
      expirationDate: z.iso.date().optional(),
      membershipType: z.string().min(1).max(100).optional(),
    })
    .strict()
    .parse(input);
  if (["APPROVED", "REJECTED"].includes(p.status))
    requirePermission(user, "requests.approve");
  return transaction(async (tx) => {
    const r = await tx.membershipRequest.findUnique({ where: { id: p.id } });
    check(r, 404, "درخواست یافت نشد.");
    check(r.status === p.expected, 409, "وضعیت درخواست تغییر کرده است.");
    assertTransition(r.status, p.status, p.reason);
    if (p.status === "APPROVED") {
      const setting = await tx.systemSetting.findUnique({
        where: { key: "requireInterview" },
      });
      check(
        setting?.value === false || r.interviewCompleted,
        400,
        "ابتدا فرم مصاحبه تکمیل شود.",
      );
      const expiry = p.expirationDate
        ? new Date(p.expirationDate)
        : new Date(Date.now() + 365 * 86400000);
      check(expiry > new Date(), 400, "تاریخ انقضا باید در آینده باشد.");
      const primary = await tx.formSubmission.findUnique({
        where: { id: r.primarySubmissionId },
        include: {
          values: { where: { fieldKey: "membershipNumber" }, take: 1 },
        },
      });
      const fromForm = primary?.values[0]?.value;
      const formMembership =
        typeof fromForm === "string" ? fromForm.trim() : "";
      const membershipNumber =
        formMembership || "M-" + String(r.sequence).padStart(7, "0");
      if (formMembership) {
        const clash = await tx.member.findUnique({
          where: { membershipNumber: formMembership },
        });
        check(!clash, 409, "این شماره عضویت قبلاً ثبت شده است.");
      }
      const member = await tx.member.create({
        data: {
          personId: r.personId,
          requestId: r.id,
          membershipNumber,
          expirationDate: expiry,
          membershipType: p.membershipType ?? "عادی",
        },
      });
      await tx.person.update({
        where: { id: r.personId },
        data: { status: "MEMBER" },
      });
      await audit(tx, user.id, "ایجاد عضو", "Member", member.id, ip);
    }
    await tx.membershipRequest.update({
      where: { id: r.id },
      data: {
        status: p.status,
        reviewedAt: ["APPROVED", "REJECTED"].includes(p.status)
          ? new Date()
          : undefined,
        rejectionReason: p.status === "REJECTED" ? p.reason : undefined,
      },
    });
    await tx.membershipRequestHistory.create({
      data: {
        requestId: r.id,
        fromStatus: r.status,
        toStatus: p.status,
        actorId: user.id,
        note: p.reason,
      },
    });
    await audit(
      tx,
      user.id,
      "تغییر وضعیت درخواست",
      "MembershipRequest",
      r.id,
      ip,
      { from: r.status, to: p.status },
    );
    return { ok: true };
  });
}
export async function updateMember(input: unknown, user: Actor, ip: string) {
  requirePermission(user, "members.write");
  const p = z
    .object({
      id,
      status: z.nativeEnum(MemberStatus).optional(),
      expirationDate: z.iso.date().optional(),
      membershipType: z.string().min(1).max(100).optional(),
      photoId: id.optional(),
      dormantReason: z.enum(["فوت", "استعفا", "لغو عضویت"]).optional(),
      dormantReasonDetail: z.string().max(2000).optional(),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const m = await tx.member.findUnique({
      where: { id: p.id },
      include: { request: { include: { primarySubmission: true } } },
    });
    check(m, 404, "عضو یافت نشد.");
    if (p.photoId) {
      const f = await tx.file.findUnique({ where: { id: p.photoId } });
      check(
        f && (f.ownerId === user.id || f.submissionId),
        403,
        "عکس متعلق به کاربر دیگری است.",
      );
      await tx.person.update({
        where: { id: m.personId },
        data: { photoId: p.photoId },
      });
    }
    if (p.status === MemberStatus.SUSPENDED) {
      check(!!p.dormantReason, 400, "برای راکد کردن، دلیل رکود الزامی است.");
      if (p.dormantReason === "استعفا" || p.dormantReason === "لغو عضویت")
        check(
          !!(p.dormantReasonDetail && p.dormantReasonDetail.trim()),
          400,
          "شرح دلیل استعفا / لغو عضویت الزامی است.",
        );
    }
    const nextStatus = p.status ?? m.status;
    await tx.member.update({
      where: { id: m.id },
      data: {
        status: nextStatus,
        ...(p.expirationDate
          ? { expirationDate: new Date(p.expirationDate) }
          : {}),
        ...(p.membershipType ? { membershipType: p.membershipType } : {}),
      },
    });
    if (p.status) {
      const formStatus = p.status === MemberStatus.SUSPENDED ? "راکد" : "فعال";
      const submission = m.request.primarySubmission;
      const data = {
        ...((submission.data as Record<string, unknown>) ?? {}),
        membershipStatus: formStatus,
        ...(p.status === MemberStatus.SUSPENDED
          ? {
              dormantReason: p.dormantReason,
              dormantReasonDetail: p.dormantReasonDetail ?? "",
            }
          : {
              dormantReason: "",
              dormantReasonDetail: "",
            }),
      };
      await tx.formSubmission.update({
        where: { id: submission.id },
        data: { data: json(data) },
      });
      for (const [fieldKey, value] of Object.entries({
        membershipStatus: formStatus,
        dormantReason: data.dormantReason ?? "",
        dormantReasonDetail: data.dormantReasonDetail ?? "",
      })) {
        await tx.formSubmissionValue.upsert({
          where: {
            submissionId_fieldKey: { submissionId: submission.id, fieldKey },
          },
          create: {
            submissionId: submission.id,
            fieldKey,
            value: json(value),
          },
          update: { value: json(value) },
        });
      }
      const noteParts = [
        `تغییر وضعیت به ${p.status === MemberStatus.SUSPENDED ? "راکد" : "فعال"}`,
        p.dormantReason ? `دلیل: ${p.dormantReason}` : "",
        p.dormantReasonDetail ? `شرح: ${p.dormantReasonDetail}` : "",
      ].filter(Boolean);
      await tx.membershipRequestHistory.create({
        data: {
          requestId: m.requestId,
          fromStatus: m.status,
          toStatus: nextStatus,
          actorId: user.id,
          note: noteParts.join(" — "),
        },
      });
    }
    await audit(tx, user.id, "به‌روزرسانی عضو", "Member", m.id, ip, {
      status: nextStatus,
      ...(p.status && p.status !== m.status ? { statusChanged: true } : {}),
      ...(p.photoId ? { photo: true } : {}),
      ...(p.expirationDate ? { expirationDate: p.expirationDate } : {}),
      ...(p.membershipType ? { membershipType: p.membershipType } : {}),
    });
    return { ok: true };
  });
}
