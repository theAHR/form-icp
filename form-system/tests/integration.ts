/** Run only against a disposable seeded test database. Mutates data. */
import assert from "node:assert/strict";
import sharp from "sharp";
import { db } from "../lib/db";
const base = process.env.APP_URL ?? "http://localhost:3000";
const suffix = Date.now().toString(36);
let assertions = 0;
function ok(value: unknown, message: string) {
  assert.ok(value, message);
  assertions++;
}
class Client {
  cookie = "";
  async call(path: string, payload?: unknown, expected = 200) {
    if (process.env.SINGLE_CONNECTION_TEST_DB === "true")
      await db.$disconnect();
    const r = await fetch(base + "/api/" + path, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        ...(payload === undefined
          ? {}
          : { "Content-Type": "application/json", Origin: base }),
        Cookie: this.cookie,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const c = r.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    const data = await r.json();
    assert.equal(r.status, expected, path + ": " + JSON.stringify(data));
    assertions++;
    return data;
  }
}
async function main() {
  assert.equal(
    process.env.ALLOW_INTEGRATION_TESTS,
    "yes",
    "Set ALLOW_INTEGRATION_TESTS=yes; this suite creates and modifies data.",
  );
  const admin = new Client(),
    viewer = new Client(),
    operator = new Client(),
    manager = new Client(),
    guest = new Client();
  async function login(client: Client, username: string) {
    await client.call("login", { username, password: "Admin@123456" });
    const me = await client.call("me");
    if (me.user.mustChangePassword) {
      await client.call("password", {
        current: "Admin@123456",
        password: "TestAccount!987654",
      });
      await client.call("login", { username, password: "TestAccount!987654" });
    }
  }
  await login(admin, "admin");
  await login(viewer, "viewer");
  await login(operator, "operator");
  await login(manager, "manager");
  await viewer.call("users", undefined, 403);
  await viewer.call("requests", undefined, 403);
  await viewer.call("forms/save", {}, 403);
  await operator.call(
    "settings/save",
    { requireInterview: false, organizationName: "test" },
    403,
  );
  await manager.call(
    "users/save",
    {
      username: "escalate" + suffix,
      displayName: "Test",
      role: "SUPER_ADMIN",
      disabled: false,
      password: "TestAccount!987654",
    },
    403,
  );
  const csrf = await fetch(base + "/api/forms/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: admin.cookie,
      Origin: "https://evil.example",
    },
    body: "{}",
  });
  ok(csrf.status === 403, "CSRF rejected");
  const schema = {
    fields: [
      {
        key: "first",
        type: "text",
        label: "نام",
        required: true,
        personField: "firstName",
      },
      {
        key: "last",
        type: "text",
        label: "نام خانوادگی",
        required: true,
        personField: "lastName",
      },
      { key: "phone", type: "phone", label: "همراه", personField: "mobile" },
      {
        key: "national",
        type: "nationalId",
        label: "کد ملی",
        personField: "nationalId",
      },
      {
        key: "skills",
        type: "repeater",
        label: "سوابق",
        children: [
          { key: "title", type: "text", label: "شرح", required: true },
        ],
        max: 3,
      },
    ],
  };
  const input = {
    title: "فرم آزمون",
    slug: "test-" + suffix,
    purpose: "APPLICATION",
    public: true,
    sensitive: false,
    schema,
    publish: true,
    expectedVersion: null,
  };
  const form = await admin.call("forms/save", input);
  const version = form.version;
  await guest.call(
    "submit",
    { versionId: version.id, answers: { first: "", last: "آزمایشی" } },
    400,
  );
  const prefix = "002" + String(Date.now()).slice(-6);
  const remainder =
    [...prefix].reduce((sum, c, i) => sum + Number(c) * (10 - i), 0) % 11;
  const national = prefix + String(remainder < 2 ? remainder : 11 - remainder);
  const receipt = await guest.call(
    "submit",
    {
      versionId: version.id,
      answers: {
        first: "کاربر",
        last: "آزمایشی",
        phone: "09123456789",
        national,
        skills: [{ title: "آموزش" }],
        unknown: "not stored",
      },
    },
    201,
  );
  await guest.call(
    "submit",
    {
      versionId: version.id,
      answers: { first: "تکراری", last: "آزمون", national },
    },
    409,
  );
  const found = await admin.call("people?q=" + national);
  ok(found.items.length === 1, "duplicate national ID has a single person");
  await admin.call(
    "submit",
    {
      versionId: version.id,
      personId: found.items[0].id,
      answers: { first: "کاربر", last: "آزمایشی", national },
    },
    201,
  );
  ok(!receipt.requestId, "public receipt does not expose record IDs");
  const request = await db.membershipRequest.findUniqueOrThrow({
    where: { requestNumber: receipt.requestNumber },
  });
  const submission = await db.formSubmission.findUniqueOrThrow({
    where: { id: request.primarySubmissionId },
  });
  ok(!("unknown" in (submission.data as object)), "unknown answers stripped");
  const schema2 = {
    fields: [
      ...schema.fields,
      { key: "extra", type: "text", label: "فیلد جدید", required: true },
    ],
  };
  const draft = await admin.call("forms/save", {
    ...input,
    id: form.id,
    schema: schema2,
    publish: false,
    expectedVersion: version.id,
  });
  const live = await guest.call("public-form/" + input.slug);
  ok(live.version.id === version.id, "draft cannot change live version");
  const published = await admin.call("forms/save", {
    ...input,
    id: form.id,
    schema: schema2,
    expectedVersion: draft.version.id,
  });
  await guest.call(
    "submit",
    { versionId: version.id, answers: { first: "کاربر", last: "دوم" } },
    409,
  );
  const historical = await admin.call("request/" + request.id);
  ok(
    historical.submissions[0].submission.version.id === version.id,
    "submission bound to old version",
  );
  ok(
    historical.submissions[0].submission.version.schema.fields.length === 5,
    "old schema unchanged",
  );
  let immutable = false;
  try {
    await db.formVersion.update({
      where: { id: version.id },
      data: { schema: { fields: [] } },
    });
  } catch {
    immutable = true;
  }
  ok(immutable, "database blocks history mutation");
  await operator.call("requests/transition", {
    id: request.id,
    expected: "NEW",
    status: "UNDER_REVIEW",
  });
  await operator.call(
    "requests/transition",
    { id: request.id, expected: "UNDER_REVIEW", status: "APPROVED" },
    403,
  );
  await admin.call(
    "requests/transition",
    { id: request.id, expected: "UNDER_REVIEW", status: "APPROVED" },
    400,
  );
  const interview = await admin.call("forms/save", {
    title: "مصاحبه آزمون",
    slug: "interview-" + suffix,
    purpose: "INTERVIEW",
    public: false,
    sensitive: true,
    schema: {
      fields: [{ key: "skill", type: "text", label: "مهارت", required: true }],
    },
    publish: true,
    expectedVersion: null,
  });
  await operator.call("public-form/" + interview.slug, undefined, 403);
  await admin.call(
    "submit",
    {
      versionId: interview.version.id,
      requestId: request.id,
      answers: { skill: "آموزش" },
    },
    201,
  );
  const restricted = await operator.call("request/" + request.id);
  ok(
    restricted.hiddenSubmissions === 1 && restricted.submissions.length === 1,
    "operator cannot read restricted response",
  );
  // Publishing a less-restricted new version cannot declassify historical answers.
  await admin.call("forms/save", {
    id: interview.id,
    title: interview.title,
    slug: interview.slug,
    purpose: "INTERVIEW",
    public: false,
    sensitive: false,
    schema: { fields: [{ key: "skill", type: "text", label: "مهارت" }] },
    publish: true,
    expectedVersion: interview.version.id,
  });
  const stillRestricted = await operator.call("request/" + request.id);
  ok(
    stillRestricted.hiddenSubmissions === 1,
    "historical sensitivity is immutable",
  );
  await admin.call("requests/transition", {
    id: request.id,
    expected: "UNDER_REVIEW",
    status: "APPROVED",
  });
  await admin.call(
    "requests/transition",
    { id: request.id, expected: "UNDER_REVIEW", status: "APPROVED" },
    409,
  );
  ok(
    (await db.member.count({ where: { requestId: request.id } })) === 1,
    "only one member created",
  );
  const member = await db.member.findUniqueOrThrow({
    where: { requestId: request.id },
  });
  const viewerMembers = await viewer.call("members");
  ok(
    viewerMembers.items.every(
      (m: { person: object }) =>
        !("nationalId" in m.person) && !("mobile" in m.person),
    ),
    "viewer receives redacted person data",
  );
  const exportDenied = await fetch(base + "/api/export?type=members", {
    headers: { Cookie: viewer.cookie },
  });
  ok(exportDenied.status === 403, "export permission enforced");
  const exported = await fetch(base + "/api/export?type=members", {
    headers: { Cookie: admin.cookie },
  });
  ok(
    exported.status === 200 &&
      (await exported.text()).includes(member.membershipNumber),
    "CSV export functional",
  );
  const upload = new FormData();
  upload.append(
    "file",
    new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/svg+xml" }),
    "bad.svg",
  );
  const badFile = await fetch(base + "/api/upload", {
    method: "POST",
    headers: { Cookie: admin.cookie, Origin: base },
    body: upload,
  });
  ok(badFile.status === 400, "SVG upload rejected");
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#123456" },
  })
    .png()
    .toBuffer();
  const goodUpload = new FormData();
  goodUpload.append(
    "file",
    new Blob([new Uint8Array(png)], { type: "image/png" }),
    "test.png",
  );
  const goodResponse = await fetch(base + "/api/upload", {
    method: "POST",
    headers: { Cookie: admin.cookie, Origin: base },
    body: goodUpload,
  });
  ok(goodResponse.status === 201, "valid raster image accepted");
  const uploaded = await goodResponse.json();
  const ownerRead = await fetch(base + "/api/files/" + uploaded.id, {
    headers: { Cookie: admin.cookie },
  });
  ok(
    ownerRead.status === 200 &&
      ownerRead.headers.get("content-type") === "image/jpeg",
    "image safely re-encoded and owner authorized",
  );
  const forbiddenRead = await fetch(base + "/api/files/" + uploaded.id, {
    headers: { Cookie: viewer.cookie },
  });
  ok(
    forbiddenRead.status === 403,
    "another user cannot retrieve an unattached private image",
  );
  const viewUser = await db.user.findUniqueOrThrow({
    where: { username: "viewer" },
  });
  await admin.call("users/save", {
    id: viewUser.id,
    username: "viewer",
    displayName: "مشاهده‌گر",
    role: "VIEWER",
    disabled: true,
  });
  const expired = await viewer.call("me");
  ok(expired.user === null, "disabling revokes sessions");
  const logs = await db.auditLog.findMany({
    where: {
      action: {
        in: [
          "Login",
          "View Sensitive Submission",
          "Create Member",
          "Export Report",
        ],
      },
    },
  });
  ok(logs.length >= 4, "sensitive lifecycle audited");
  ok(
    !JSON.stringify(logs).includes("TestAccount!"),
    "password absent in audit",
  );
  console.log(
    `Integration: ${assertions} assertions passed (authentication, RBAC, versions, submissions, workflow, export, audit).`,
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
