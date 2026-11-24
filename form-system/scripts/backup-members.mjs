import { mkdir, writeFile, readdir, rm, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupRoot = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve("C:/ICP/backups");
const membersRoot = path.join(backupRoot, "members-weekly");
const stampFile = path.join(membersRoot, "last-run.txt");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP = 12;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    "_" +
    p(d.getHours()) +
    p(d.getMinutes())
  );
}

function csvEscape(v) {
  let s = String(v ?? "");
  if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

async function exportMembers() {
  const db = new PrismaClient();
  try {
    const members = await db.member.findMany({
      orderBy: { startDate: "desc" },
      include: {
        person: true,
        request: {
          include: {
            primarySubmission: {
              include: {
                values: true,
                version: { select: { number: true, slug: true, title: true } },
              },
            },
          },
        },
      },
    });

    const rows = members.map((m) => {
      const values = Object.fromEntries(
        m.request.primarySubmission.values.map((v) => [v.fieldKey, v.value]),
      );
      return {
        id: m.id,
        membershipNumber: m.membershipNumber,
        membershipType: m.membershipType,
        status: m.status,
        startDate: m.startDate,
        expirationDate: m.expirationDate,
        person: {
          id: m.person.id,
          firstName: m.person.firstName,
          lastName: m.person.lastName,
          fatherName: m.person.fatherName,
          nationalId: m.person.nationalId,
          birthDate: m.person.birthDate,
          mobile: m.person.mobile,
          email: m.person.email,
          photoId: m.person.photoId,
          status: m.person.status,
        },
        registrarNotes: m.request.internalNote,
        formVersion: m.request.primarySubmission.version,
        formData: m.request.primarySubmission.data,
        formValues: values,
      };
    });

    await mkdir(membersRoot, { recursive: true });
    const dest = path.join(membersRoot, stamp());
    await mkdir(dest, { recursive: true });

    const payload = {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      members: rows,
    };
    await writeFile(
      path.join(dest, "members.json"),
      JSON.stringify(payload, null, 2),
      "utf8",
    );

    const csvLines = [
      [
        "membershipNumber",
        "firstName",
        "lastName",
        "nationalId",
        "mobile",
        "status",
        "membershipType",
        "startDate",
        "expirationDate",
        "province",
        "city",
        "membershipStatus",
        "registrarNotes",
      ].join(","),
    ];
    for (const r of rows) {
      csvLines.push(
        [
          r.membershipNumber,
          r.person.firstName,
          r.person.lastName,
          r.person.nationalId,
          r.person.mobile,
          r.status,
          r.membershipType,
          r.startDate.toISOString(),
          r.expirationDate.toISOString(),
          r.formValues.province,
          r.formValues.city,
          r.formValues.membershipStatus,
          r.registrarNotes,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    await writeFile(
      path.join(dest, "members.csv"),
      "\uFEFF" + csvLines.join("\r\n"),
      "utf8",
    );
    await writeFile(stampFile, new Date().toISOString(), "utf8");

    const dirs = (await readdir(membersRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    while (dirs.length > KEEP) {
      const old = dirs.shift();
      await rm(path.join(membersRoot, old), { recursive: true, force: true });
    }

    console.log(
      `[members-backup] saved ${rows.length} members -> ${path.relative(root, dest)}`,
    );
    return dest;
  } finally {
    await db.$disconnect();
  }
}

async function lastRunMs() {
  try {
    await access(stampFile);
    const t = (await readFile(stampFile, "utf8")).trim();
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms : 0;
  } catch {
    return 0;
  }
}

async function maybeRun() {
  const last = await lastRunMs();
  if (Date.now() - last < WEEK_MS) {
    console.log("[members-backup] skip; last run still within 7 days");
    return null;
  }
  return exportMembers();
}

async function daemon() {
  const tick = async () => {
    try {
      await maybeRun();
    } catch (e) {
      console.error("[members-backup] failed", e);
    }
  };
  await tick();
  setInterval(tick, 60 * 60 * 1000);
}

const mode = process.argv[2] ?? "once";
if (mode === "daemon") {
  await daemon();
} else if (mode === "check") {
  await maybeRun();
} else {
  await exportMembers();
}
