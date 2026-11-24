import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  actor,
  requirePermission,
  sameOrigin,
  ip,
  limit,
  sweepRateLimits,
  verifyPassword,
  passwordHash,
  token,
  hashToken,
  cookie,
  cookieName,
  cookieHeader,
} from "@/lib/auth";
import { AppError, check } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { listing, requestDetail, memberDetail, csv } from "@/lib/queries";
import {
  exportMeta,
  listExportForms,
  runAdvancedExport,
} from "@/lib/advanced-export";
import {
  saveForm,
  submit,
  transition,
  updateMember,
  transaction,
} from "@/lib/service";
import { saveUser, deleteUser } from "@/lib/users";
import { storage, cleanUpload, cleanDocumentUpload } from "@/lib/storage";
import { date, dateTime } from "@/lib/utils";
import { statuses } from "@/lib/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (v: unknown, status = 200) =>
  NextResponse.json(v, { status, headers: { "Cache-Control": "no-store" } });
async function body(req: Request) {
  check(
    Number(req.headers.get("content-length") ?? 0) <= 300000,
    413,
    "درخواست بیش از حد بزرگ است.",
  );
  const reader = req.body?.getReader();
  check(reader, 400, "بدنه درخواست لازم است.");
  let length = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    length += r.value.length;
    if (length > 300000) {
      await reader.cancel();
      throw new AppError(413, "درخواست بیش از حد بزرگ است.");
    }
    chunks.push(r.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path;
  const route = path.join("/");
  const address = ip(req);
  const user = await actor(req);
  if (req.method === "POST") sameOrigin(req);
  if (route === "me") return response({ user });
  if (route === "login" && req.method === "POST") {
    const p = z
      .object({
        username: z.string().min(1).max(50),
        password: z.string().min(1).max(72),
      })
      .strict()
      .parse(await body(req));
    await limit("login-ip:" + address, 100, 900);
    await limit("login-user:" + hashToken(p.username.toLowerCase()), 10, 900);
    const u = await db.user.findUnique({ where: { username: p.username } });
    const valid = await verifyPassword(p.password, u?.passwordHash);
    if (!u || !valid || u.disabled) {
      await audit(db, null, "ورود ناموفق", "User", undefined, address);
      throw new AppError(401, "نام کاربری یا رمز عبور نادرست است.");
    }
    const raw = token();
    await transaction(async (tx) => {
      await tx.session.create({
        data: {
          id: hashToken(raw),
          userId: u.id,
          expiresAt: new Date(Date.now() + 8 * 3600000),
        },
      });
      await audit(tx, u.id, "ورود به سامانه", "User", u.id, address);
    });
    const res = response({ ok: true });
    res.headers.set("Set-Cookie", cookieHeader(cookieName, raw, 8 * 3600));
    return res;
  }
  if (route === "logout" && req.method === "POST") {
    if (user)
      await transaction(async (tx) => {
        await tx.session.deleteMany({
          where: { id: hashToken(cookie(req, cookieName) ?? "") },
        });
        await audit(tx, user.id, "خروج از سامانه", "User", user.id, address);
      });
    const res = response({ ok: true });
    res.headers.set("Set-Cookie", cookieHeader(cookieName, "", 0));
    return res;
  }
  if (route === "password" && req.method === "POST") {
    check(user, 401, "ابتدا وارد شوید.");
    await limit("password:" + user.id, 10, 900);
    const p = z
      .object({ current: z.string().max(72), password: z.string().max(72) })
      .strict()
      .parse(await body(req));
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    check(
      await verifyPassword(p.current, u.passwordHash),
      400,
      "رمز فعلی نادرست است.",
    );
    check(p.current !== p.password, 400, "رمز جدید باید متفاوت باشد.");
    const hash = await passwordHash(p.password);
    await transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, mustChangePassword: false },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, user.id, "تغییر رمز عبور", "User", user.id, address);
    });
    return response({ ok: true });
  }
  if (path[0] === "public-form" && req.method === "GET") {
    const f = await db.form.findUnique({ where: { slug: path[1] } });
    check(
      f && f.status === "PUBLISHED" && f.currentVersionId,
      404,
      "فرم در دسترس نیست.",
    );
    if (!f.public) {
      requirePermission(user, "submissions.write");
      if (f.sensitive) requirePermission(user, "submissions.sensitive");
    }
    const v = await db.formVersion.findUniqueOrThrow({
      where: { id: f.currentVersionId },
    });
    return response({
      id: f.id,
      title: f.title,
      slug: f.slug,
      purpose: f.purpose,
      version: v,
    });
  }
  if (route === "submit" && req.method === "POST") {
    await limit("submit:" + (user?.id ?? address), user ? 100 : 20, 3600);
    return response(await submit(await body(req), user, req, address), 201);
  }
  if (route === "upload" && req.method === "POST") {
    if (user) check(!user.mustChangePassword, 403, "رمز عبور را تغییر دهید.");
    else {
      const slug = req.nextUrl.searchParams.get("form");
      const form = slug ? await db.form.findUnique({ where: { slug } }) : null;
      check(
        form?.public && form.status === "PUBLISHED" && !form.sensitive,
        403,
        "فرم عمومی معتبر لازم است.",
      );
    }
    const kind = req.nextUrl.searchParams.get("kind") === "document"
      ? "document"
      : "image";
    await limit(
      "upload:" + (user?.id ?? address),
      kind === "document" ? 120 : 30,
      3600,
    );
    const maxBytes = kind === "document" ? 51 * 1024 * 1024 : 6 * 1024 * 1024;
    const length = Number(req.headers.get("content-length") ?? 0);
    check(
      length > 0 && length <= maxBytes,
      413,
      kind === "document"
        ? "اندازه فایل باید مشخص و حداکثر حدود ۵۰ مگابایت باشد."
        : "اندازه فایل باید مشخص و کمتر از ۶ مگابایت باشد.",
    );
    const form = await req.formData();
    const file = form.get("file");
    check(file instanceof File, 400, "فایل لازم است.");
    const clean =
      kind === "document"
        ? await cleanDocumentUpload(file)
        : await cleanUpload(file);
    const key = await storage.put(clean.bytes);
    const guest = cookie(req, "ICP_upload") ?? token();
    try {
      const f = await db.file.create({
        data: {
          storageKey: key,
          originalName: file.name.slice(0, 150),
          mime: clean.mime,
          size: clean.bytes.length,
          ownerId: user?.id,
          guestHash: user ? null : hashToken(guest),
        },
      });
      const res = response(
        { id: f.id, name: f.originalName, mime: f.mime, size: f.size },
        201,
      );
      if (!user)
        res.headers.set(
          "Set-Cookie",
          cookieHeader("ICP_upload", guest, 3600),
        );
      return res;
    } catch (e) {
      await storage.remove(key);
      throw e;
    }
  }
  check(user, 401, "ابتدا وارد شوید.");
  check(!user.mustChangePassword, 403, "ابتدا رمز عبور را تغییر دهید.");
  // محدودیت کلی برای جلوگیری از فشار روی سرور
  await limit("api-user:" + user.id, 240, 60);
  await limit("api-ip:" + address, 400, 60);
  if (Math.random() < 0.02) void sweepRateLimits().catch(() => {});
  if (path[0] === "files" && req.method === "GET") {
    const f = await db.file.findUnique({
      where: { id: path[1] },
      include: {
        submission: { include: { version: { include: { form: true } } } },
      },
    });
    check(f, 404, "فایل یافت نشد.");
    if (f.submission) {
      requirePermission(user, "submissions.read");
      if (f.submission.version.sensitive)
        requirePermission(user, "submissions.sensitive");
    } else check(f.ownerId === user.id, 403, "دسترسی به فایل مجاز نیست.");
    await audit(db, user.id, "مشاهده فایل", "File", f.id, address);
    const safeName = (f.originalName || "file")
      .replace(/[^\w.\u0600-\u06FF\- ()]/g, "_")
      .slice(0, 120);
    const disposition = f.mime.startsWith("image/")
      ? `inline; filename="${safeName}"`
      : `attachment; filename="${safeName}"`;
    return new NextResponse(new Uint8Array(await storage.get(f.storageKey)), {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  }
  if (path[0] === "request" && req.method === "GET")
    return response(await requestDetail(path[1], user, address));
  if (path[0] === "member" && req.method === "GET")
    return response(await memberDetail(path[1], user, address));
  if (route === "export-forms" && req.method === "GET")
    return response(await listExportForms(user));
  if (route === "export-meta" && req.method === "GET") {
    const slug = req.nextUrl.searchParams.get("slug") ?? "";
    check(slug.length > 0 && slug.length <= 80, 400, "فرم مشخص نشده است.");
    return response(await exportMeta(slug, user));
  }
  if (route === "export-advanced" && req.method === "POST") {
    const payload = await body(req);
    const isPreview =
      !!payload &&
      typeof payload === "object" &&
      (payload as { preview?: boolean }).preview === true;
    if (isPreview) await limit("export-preview:" + user.id, 40, 60);
    else {
      await limit("export-hour:" + user.id, 10, 3600);
      await limit("export-day:" + user.id, 40, 86400);
    }
    const result = await runAdvancedExport(payload, user, address);
    if (!("csv" in result)) return response(result);
    return new NextResponse(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Rows": String(result.total),
      },
    });
  }
  if (route === "export" && req.method === "GET") {
    requirePermission(user, "reports.export");
    await limit("export-hour:" + user.id, 10, 3600);
    await limit("export-day:" + user.id, 40, 86400);
    const type =
      req.nextUrl.searchParams.get("type") === "requests"
        ? "requests"
        : "members";
    requirePermission(user, type + ".read");
    requirePermission(user, "people.read");
    const rows: unknown[][] =
      type === "members"
        ? [["کد عضویت", "نام", "نام خانوادگی", "وضعیت", "انقضا"]]
        : [["کد عضویت", "نام", "نام خانوادگی", "وضعیت", "تاریخ"]];
    if (type === "members") {
      for (const m of await db.member.findMany({
        take: 8000,
        orderBy: { id: "asc" },
        include: { person: { select: { firstName: true, lastName: true } } },
      }))
        rows.push([
          m.membershipNumber,
          m.person.firstName,
          m.person.lastName,
          statuses[m.status] ?? m.status,
          date(m.expirationDate),
        ]);
    } else {
      for (const r of await db.membershipRequest.findMany({
        take: 8000,
        orderBy: { id: "asc" },
        include: {
          person: { select: { firstName: true, lastName: true } },
          member: { select: { membershipNumber: true } },
          primarySubmission: {
            select: {
              values: {
                where: { fieldKey: "membershipNumber" },
                select: { value: true },
                take: 1,
              },
            },
          },
        },
      })) {
        const fromForm = r.primarySubmission.values[0]?.value;
        const code =
          r.member?.membershipNumber ||
          (typeof fromForm === "string" ? fromForm : "") ||
          "";
        rows.push([
          code,
          r.person.firstName,
          r.person.lastName,
          statuses[r.status] ?? r.status,
          dateTime(r.createdAt),
        ]);
      }
    }
    await audit(db, user.id, "خروجی گزارش", type, undefined, address, {
      rows: rows.length - 1,
    });
    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  if (req.method === "GET")
    return response(await listing(route, req.nextUrl, user, address));
  const payload = await body(req);
  if (route === "forms/save")
    return response(await saveForm(payload, user, address));
  if (route === "forms/archive") {
    requirePermission(user, "forms.write");
    const p = z.object({ id: z.string() }).strict().parse(payload);
    return response(
      await transaction(async (tx) => {
        await tx.form.update({
          where: { id: p.id },
          data: { status: "ARCHIVED", currentVersionId: null },
        });
        await audit(tx, user.id, "بایگانی فرم", "Form", p.id, address);
        return { ok: true };
      }),
    );
  }
  if (route === "requests/transition")
    return response(await transition(payload, user, address));
  if (route === "requests/note") {
    requirePermission(user, "requests.write");
    const p = z
      .object({
        id: z.string(),
        internalNote: z.string().max(2000),
        assignedTo: z.string().nullable(),
      })
      .strict()
      .parse(payload);
    return response(
      await transaction(async (tx) => {
        if (p.assignedTo) {
          const assignee = await tx.user.findUnique({
            where: { id: p.assignedTo },
            include: {
              roles: { include: { role: { include: { permissions: true } } } },
            },
          });
          check(
            assignee &&
              !assignee.disabled &&
              assignee.roles.some((r) =>
                r.role.permissions.some(
                  (p) => p.permissionId === "requests.write",
                ),
              ),
            400,
            "کاربر مسئول مجاز نیست.",
          );
        }
        await tx.membershipRequest.update({
          where: { id: p.id },
          data: { internalNote: p.internalNote, assignedTo: p.assignedTo },
        });
        await audit(
          tx,
          user.id,
          "ثبت یادداشت / مسئول درخواست",
          "MembershipRequest",
          p.id,
          address,
        );
        return { ok: true };
      }),
    );
  }
  if (route === "users/save")
    return response(await saveUser(payload, user, address));
  if (route === "users/delete")
    return response(await deleteUser(payload, user, address));
  if (route === "members/save")
    return response(await updateMember(payload, user, address));
  if (route === "settings/save") {
    requirePermission(user, "settings.manage");
    const p = z
      .object({
        requireInterview: z.boolean(),
        organizationName: z.string().min(1).max(150),
      })
      .strict()
      .parse(payload);
    return response(
      await transaction(async (tx) => {
        for (const [key, value] of Object.entries(p))
          await tx.systemSetting.upsert({
            where: { key },
            create: { key, value },
            update: { value },
          });
        await audit(
          tx,
          user.id,
          "تغییر تنظیمات",
          "SystemSetting",
          undefined,
          address,
        );
        return { ok: true };
      }),
    );
  }
  throw new AppError(404, "مسیر یافت نشد.");
}
async function safe(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    return await handler(req, ctx);
  } catch (e) {
    if (e instanceof z.ZodError)
      return response(
        {
          error: e.issues
            .map((i) => i.path.join(".") + ": " + i.message)
            .join("؛ "),
          issues: e.issues,
        },
        400,
      );
    if (e instanceof AppError) return response({ error: e.message }, e.status);
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2025", "P2034"].includes(e.code)
    )
      return response(
        {
          error:
            "رکورد تکراری، حذف‌شده یا تغییر هم‌زمان؛ اطلاعات را بازخوانی کنید.",
        },
        409,
      );
    if (e instanceof SyntaxError)
      return response({ error: "ساختار JSON نامعتبر است." }, 400);
    console.error(
      "Request failed",
      e instanceof Error ? e.name : "UnknownError",
    );
    return response({ error: "خطای داخلی؛ رخداد در سرور ثبت شد." }, 500);
  }
}
export { safe as GET, safe as POST };
