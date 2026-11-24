import { test, expect } from "@playwright/test";
test("login, dashboard, dynamic form preview and builder", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("نام کاربری").fill("admin");
  await page
    .getByLabel("رمز عبور", { exact: true })
    .fill(process.env.E2E_PASSWORD ?? "TestAccount!987654");
  await page.getByRole("button", { name: "ورود به حساب" }).click();
  await expect(
    page.getByRole("heading", { name: "نمای کلی عضویت" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.getByRole("link", { name: "فرم‌ساز", exact: true }).click();
  await expect(page.getByRole("heading", { name: "فرم‌ساز" })).toBeVisible();
  await page.getByRole("button", { name: "فرم جدید", exact: true }).click();
  await page.getByRole("button", { name: "متن کوتاه", exact: true }).click();
  await page
    .getByRole("button", { name: "گروه تکرارشونده", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/form-builder.png",
    fullPage: true,
  });
  const handles = page.getByRole("button", {
    name: "جابه‌جایی فیلد",
    exact: true,
  });
  await handles.first().scrollIntoViewIfNeeded();
  const source = await handles.first().boundingBox();
  const target = await handles.nth(1).boundingBox();
  if (!source || !target) throw new Error("Drag handles missing");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2 + 10,
    { steps: 3 },
  );
  await expect(handles.first()).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2 + 10,
    { steps: 10 },
  );
  await page.mouse.up();
  // dnd-kit suppresses the synthetic click briefly after a pointer drop.
  await page.waitForTimeout(200);
  await expect(page.locator(".canvas-field").first()).toContainText(
    "گروه تکرارشونده",
  );
  await page.getByRole("button", { name: "پیش‌نمایش", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "+ افزودن ردیف" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ افزودن ردیف" }).click();
  await expect(page.getByLabel("شرح")).toBeVisible();
  await page.screenshot({
    path: "test-results/form-preview.png",
    fullPage: true,
  });
});
test("public application is a real form with required validation", async ({
  page,
}) => {
  await page.goto("/forms/membership-application");
  await expect(
    page.getByRole("heading", { name: "ثبت اطلاعات فردی اعضا" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ثبت اطلاعات", exact: true }).click();
  await expect(page.locator(".error[role=alert]")).toBeVisible();
  await page.screenshot({
    path: "test-results/public-form.png",
    fullPage: true,
  });
});
