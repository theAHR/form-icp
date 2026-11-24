import { Prisma } from "@prisma/client";
import { db } from "./db";
import { type Actor, requirePermission } from "./auth";
import { audit } from "./audit";
import { check, AppError } from "./errors";
const insensitive = { mode: "insensitive" as Prisma.QueryMode };
export function paging(url: URL) {
  const iso = (key: string) => {
    const v = url.searchParams.get(key) ?? "";
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  };
  return {
    page: Math.max(
      1,
      Math.min(10000, Number(url.searchParams.get("page")) || 1),
    ),
    size: Math.max(1, Math.min(50, Number(url.searchParams.get("size")) || 20)),
    q: (url.searchParams.get("q") ?? "").slice(0, 100),
    status: url.searchParams.get("status") ?? "",
    asc: url.searchParams.get("sort") === "asc",
    createdFrom: iso("createdFrom"),
    createdTo: iso("createdTo"),
    gender: (url.searchParams.get("gender") ?? "").slice(0, 20),
    membershipStatus: (url.searchParams.get("membershipStatus") ?? "").slice(
      0,
      20,
    ),
    province: (url.searchParams.get("province") ?? "").slice(0, 80),
    city: (url.searchParams.get("city") ?? "").slice(0, 80),
  };
}
export const personBrief = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.PersonSelect;
export async function listing(
  resource: string,
  url: URL,
  user: Actor,
  ip: string,
) {
  const { page, size, q, status, asc } = paging(url);
  const skip = (page - 1) * size;
  const order = asc ? "asc" : "desc";
  if (resource === "dashboard") {
    requirePermission(user, "dashboard.read");
    const now = new Date();
    const [
      applicants,
      newRequests,
      review,
      interview,
      approved,
      rejected,
      members,
      active,
      expired,
      activities,
    ] = await Promise.all([
      db.person.count(),
      db.membershipRequest.count({ where: { status: "NEW" } }),
      db.membershipRequest.count({ where: { status: "UNDER_REVIEW" } }),
      db.membershipRequest.count({
        where: { status: "UNDER_REVIEW", interviewCompleted: false },
      }),
      db.membershipRequest.count({ where: { status: "APPROVED" } }),
      db.membershipRequest.count({ where: { status: "REJECTED" } }),
      db.member.count(),
      db.member.count({
        where: { status: "ACTIVE", expirationDate: { gt: now } },
      }),
      db.member.count({
        where: {
          OR: [{ status: "EXPIRED" }, { expirationDate: { lte: now } }],
        },
      }),
      user.permissions.includes("audit.read")
        ? db.auditLog.findMany({
            take: 8,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              action: true,
              entity: true,
              createdAt: true,
              actorId: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const actorIds = [
      ...new Set(
        activities
          .map((a) => ("actorId" in a ? a.actorId : null))
          .filter((id): id is string => !!id),
      ),
    ];
    const actors = actorIds.length
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true },
        })
      : [];
    const actorById = Object.fromEntries(
      actors.map((u) => [u.id, u.displayName]),
    );
    return {
      applicants,
      newRequests,
      review,
      interview,
      approved,
      rejected,
      members,
      active,
      expired,
      activities: activities.map((a) => ({
        ...a,
        actorName:
          "actorId" in a && a.actorId
            ? (actorById[a.actorId] ?? null)
            : null,
      })),
    };
  }
  if (resource === "forms") {
    requirePermission(user, "forms.read");
    const items = await db.form.findMany({
      where: {
        status: { not: "ARCHIVED" },
        ...(user.permissions.includes("submissions.sensitive")
          ? {}
          : { sensitive: false }),
      },
      orderBy: { createdAt: "desc" },
      include: { versions: { orderBy: { number: "desc" }, take: 1 } },
    });
    return {
      items: items.map((f) => ({
        ...f,
        versions: user.permissions.includes("forms.write")
          ? f.versions
          : f.versions.filter((v) => v.id === f.currentVersionId),
      })),
    };
  }
  if (resource === "users") {
    requirePermission(user, "users.manage");
    return {
      items: await db.user.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          displayName: true,
          disabled: true,
          mustChangePassword: true,
          roles: { select: { roleId: true } },
        },
      }),
    };
  }
  if (resource === "requests") {
    requirePermission(user, "requests.read");
    const {
      createdFrom,
      createdTo,
      gender,
      membershipStatus,
      province,
      city,
    } = paging(url);
    check(
      !status ||
        [
          "NEW",
          "UNDER_REVIEW",
          "NEEDS_CORRECTION",
          "APPROVED",
          "REJECTED",
          "CANCELLED",
        ].includes(status),
      400,
      "وضعیت نامعتبر است.",
    );
    const formEquals: { fieldKey: string; value: string }[] = [];
    if (gender) formEquals.push({ fieldKey: "gender", value: gender });
    if (membershipStatus)
      formEquals.push({ fieldKey: "membershipStatus", value: membershipStatus });
    if (province) formEquals.push({ fieldKey: "province", value: province });
    if (city) formEquals.push({ fieldKey: "city", value: city });

    const valueFilters: Prisma.MembershipRequestWhereInput[] = formEquals.map(
      (f) => ({
        primarySubmission: {
          values: {
            some: {
              fieldKey: f.fieldKey,
              value: { equals: f.value },
            },
          },
        },
      }),
    );

    const where: Prisma.MembershipRequestWhereInput = {
      ...(status ? { status: status as Prisma.EnumRequestStatusFilter } : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom
                ? { gte: new Date(createdFrom + "T00:00:00.000Z") }
                : {}),
              ...(createdTo
                ? { lte: new Date(createdTo + "T23:59:59.999Z") }
                : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { requestNumber: { contains: q, ...insensitive } },
              {
                member: {
                  membershipNumber: { contains: q, ...insensitive },
                },
              },
              {
                primarySubmission: {
                  values: {
                    some: {
                      fieldKey: "membershipNumber",
                      value: { string_contains: q },
                    },
                  },
                },
              },
              {
                person: {
                  OR: [
                    { firstName: { contains: q } },
                    { lastName: { contains: q } },
                    { nationalId: q },
                    { mobile: { contains: q } },
                  ],
                },
              },
            ],
          }
        : {}),
      ...(valueFilters.length ? { AND: valueFilters } : {}),
    };
    const [rawItems, total] = await Promise.all([
      db.membershipRequest.findMany({
        where,
        skip,
        take: size,
        orderBy: { createdAt: order },
        include: {
          person: { select: personBrief },
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
      }),
      db.membershipRequest.count({ where }),
    ]);
    const items = rawItems.map((r) => {
      const fromForm = r.primarySubmission.values[0]?.value;
      const formMembership =
        typeof fromForm === "string"
          ? fromForm
          : fromForm != null
            ? String(fromForm)
            : "";
      return {
        id: r.id,
        requestNumber: r.requestNumber,
        membershipNumber:
          r.member?.membershipNumber || formMembership || "",
        status: r.status,
        createdAt: r.createdAt,
        interviewCompleted: r.interviewCompleted,
        person: r.person,
      };
    });
    return { items, total, page, size };
  }
  if (resource === "members") {
    requirePermission(user, "members.read");
    check(
      !status ||
        ["ACTIVE", "EXPIRED", "SUSPENDED", "CANCELLED"].includes(status),
      400,
      "وضعیت نامعتبر است.",
    );
    const {
      createdFrom,
      createdTo,
      gender,
      membershipStatus,
      province,
      city,
    } = paging(url);
    const full = user.permissions.includes("people.read");
    const formEquals: { fieldKey: string; value: string }[] = [];
    if (gender) formEquals.push({ fieldKey: "gender", value: gender });
    if (membershipStatus)
      formEquals.push({ fieldKey: "membershipStatus", value: membershipStatus });
    if (province) formEquals.push({ fieldKey: "province", value: province });
    if (city) formEquals.push({ fieldKey: "city", value: city });
    const valueFilters: Prisma.MemberWhereInput[] = formEquals.map((f) => ({
      request: {
        primarySubmission: {
          values: {
            some: {
              fieldKey: f.fieldKey,
              value: { equals: f.value },
            },
          },
        },
      },
    }));
    const andFilters: Prisma.MemberWhereInput[] = [...valueFilters];
    if (q) {
      andFilters.push({
        OR: [
          { membershipNumber: { contains: q, ...insensitive } },
          {
            person: {
              OR: [
                { firstName: { contains: q } },
                { lastName: { contains: q } },
                ...(full
                  ? [{ nationalId: q }, { mobile: { contains: q } }]
                  : []),
              ],
            },
          },
        ],
      });
    }
    const where: Prisma.MemberWhereInput = {
      ...(status === "EXPIRED"
        ? {
            OR: [
              { status: "EXPIRED" },
              { expirationDate: { lte: new Date() } },
            ],
          }
        : status
          ? {
              status: status as Prisma.EnumMemberStatusFilter,
              ...(status === "ACTIVE"
                ? { expirationDate: { gt: new Date() } }
                : {}),
            }
          : {}),
      ...(createdFrom || createdTo
        ? {
            startDate: {
              ...(createdFrom
                ? { gte: new Date(createdFrom + "T00:00:00.000Z") }
                : {}),
              ...(createdTo
                ? { lte: new Date(createdTo + "T23:59:59.999Z") }
                : {}),
            },
          }
        : {}),
      ...(andFilters.length ? { AND: andFilters } : {}),
    };
    const [rawItems, total] = await Promise.all([
      db.member.findMany({
        where,
        skip,
        take: size,
        orderBy: { startDate: order },
        include: {
          person: {
            select: full
              ? {
                  ...personBrief,
                  nationalId: true,
                  mobile: true,
                  email: true,
                  photoId: true,
                }
              : personBrief,
          },
          request: {
            select: {
              internalNote: true,
              primarySubmission: {
                select: {
                  createdBy: true,
                  createdAt: true,
                  values: {
                    where: {
                      fieldKey: {
                        in: ["registrarNotes", "membershipStatus"],
                      },
                    },
                    select: { fieldKey: true, value: true },
                  },
                },
              },
            },
          },
        },
      }),
      db.member.count({ where }),
    ]);
    const registrarIds = [
      ...new Set(
        rawItems
          .map((m) => m.request.primarySubmission.createdBy)
          .filter((x): x is string => !!x),
      ),
    ];
    const registrars = registrarIds.length
      ? await db.user.findMany({
          where: { id: { in: registrarIds } },
          select: { id: true, displayName: true, username: true },
        })
      : [];
    const byRegistrar = Object.fromEntries(registrars.map((u) => [u.id, u]));
    const items = rawItems.map((m) => {
      const values = Object.fromEntries(
        m.request.primarySubmission.values.map((v) => [v.fieldKey, v.value]),
      );
      const notesRaw = values.registrarNotes;
      const registrarNotes =
        typeof notesRaw === "string"
          ? notesRaw
          : m.request.internalNote || "";
      const createdBy = m.request.primarySubmission.createdBy;
      const registrar = createdBy ? byRegistrar[createdBy] : null;
      return {
        id: m.id,
        membershipNumber: m.membershipNumber,
        status: m.status,
        expirationDate: m.expirationDate,
        membershipType: m.membershipType,
        startDate: m.startDate,
        person: m.person,
        registrarName: registrar?.displayName ?? registrar?.username ?? "—",
        registrarNotes,
        formMembershipStatus:
          typeof values.membershipStatus === "string"
            ? values.membershipStatus
            : "",
      };
    });
    return { items, total, page, size };
  }
  if (resource === "people") {
    requirePermission(user, "people.read");
    check(q.length >= 3, 400, "حداقل سه نویسه وارد کنید.");
    return {
      items: await db.person.findMany({
        where: {
          OR: [
            { nationalId: q },
            { lastName: { contains: q } },
            { mobile: { contains: q } },
          ],
        },
        take: 10,
        select: { ...personBrief, nationalId: true },
      }),
    };
  }
  if (resource === "audit") {
    requirePermission(user, "audit.read");
    const items = await db.auditLog.findMany({
      skip,
      take: size,
      orderBy: { createdAt: "desc" },
    });
    const actorIds = [
      ...new Set(items.map((a) => a.actorId).filter(Boolean) as string[]),
    ];
    const actors = actorIds.length
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, username: true },
        })
      : [];
    const byId = Object.fromEntries(actors.map((u) => [u.id, u]));
    return {
      items: items.map((a) => ({
        ...a,
        actorName: a.actorId
          ? (byId[a.actorId]?.displayName ?? a.actorId)
          : null,
        actorUsername: a.actorId ? (byId[a.actorId]?.username ?? null) : null,
      })),
      total: await db.auditLog.count(),
      page,
      size,
    };
  }
  if (resource === "settings") {
    requirePermission(user, "settings.manage");
    return { items: await db.systemSetting.findMany() };
  }
  throw new AppError(404, "مسیر یافت نشد.");
}
export async function requestDetail(id: string, user: Actor, ip: string) {
  requirePermission(user, "requests.read");
  requirePermission(user, "submissions.read");
  const r = await db.membershipRequest.findUnique({
    where: { id },
    include: {
      person: true,
      history: { orderBy: { createdAt: "asc" } },
      submissions: {
        include: {
          submission: { include: { version: { include: { form: true } } } },
        },
      },
    },
  });
  check(r, 404, "درخواست یافت نشد.");
  const allowed = r.submissions.filter(
    (s) =>
      !s.submission.version.sensitive ||
      user.permissions.includes("submissions.sensitive"),
  );
  await audit(
    db,
    user.id,
    allowed.some((s) => s.submission.version.sensitive)
      ? "مشاهده پاسخ محرمانه"
      : "مشاهده درخواست عضویت",
    "MembershipRequest",
    id,
    ip,
  );
  return {
    ...r,
    submissions: allowed,
    hiddenSubmissions: r.submissions.length - allowed.length,
  };
}
export async function memberDetail(id: string, user: Actor, ip: string) {
  requirePermission(user, "members.read");
  requirePermission(user, "submissions.read");
  const m = await db.member.findUnique({
    where: { id },
    include: {
      person: true,
      request: {
        include: {
          history: { orderBy: { createdAt: "asc" } },
          primarySubmission: {
            include: {
              version: { include: { form: true } },
            },
          },
          submissions: {
            include: {
              submission: {
                include: { version: { include: { form: true } } },
              },
            },
          },
        },
      },
    },
  });
  check(m, 404, "عضو یافت نشد.");
  const allowed = m.request.submissions.filter(
    (s) =>
      !s.submission.version.sensitive ||
      user.permissions.includes("submissions.sensitive"),
  );
  const createdBy = m.request.primarySubmission.createdBy;
  const registrar = createdBy
    ? await db.user.findUnique({
        where: { id: createdBy },
        select: { id: true, displayName: true, username: true },
      })
    : null;
  await audit(
    db,
    user.id,
    allowed.some((s) => s.submission.version.sensitive)
      ? "مشاهده پاسخ محرمانه"
      : "مشاهده پرونده عضو",
    "Member",
    id,
    ip,
  );
  return {
    id: m.id,
    membershipNumber: m.membershipNumber,
    membershipType: m.membershipType,
    status: m.status,
    startDate: m.startDate,
    expirationDate: m.expirationDate,
    person: m.person,
    registrarName: registrar?.displayName ?? registrar?.username ?? "—",
    registrarNotes: m.request.internalNote ?? "",
    primarySubmission: m.request.primarySubmission,
    submissions: allowed,
    hiddenSubmissions: m.request.submissions.length - allowed.length,
    history: m.request.history,
  };
}
export function csv(rows: unknown[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v ?? "");
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replace(/"/g, '""') + '"';
          })
          .join(","),
      )
      .join("\r\n")
  );
}
