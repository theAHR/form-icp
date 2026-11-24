import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const members = await db.member.findMany({
  include: {
    request: {
      include: {
        primarySubmission: {
          include: {
            values: { where: { fieldKey: "membershipNumber" } },
          },
        },
      },
    },
  },
});

let updated = 0;
for (const m of members) {
  const raw = m.request.primarySubmission.values[0]?.value;
  const formNo = typeof raw === "string" ? raw.trim() : "";
  if (!formNo || formNo === m.membershipNumber) continue;
  const clash = await db.member.findUnique({
    where: { membershipNumber: formNo },
  });
  if (clash && clash.id !== m.id) {
    console.log("skip clash", m.membershipNumber, "->", formNo);
    continue;
  }
  await db.member.update({
    where: { id: m.id },
    data: { membershipNumber: formNo },
  });
  updated++;
  console.log(m.membershipNumber, "->", formNo);
}
console.log("updated", updated);
await db.$disconnect();
