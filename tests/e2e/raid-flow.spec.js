// raid-flow.spec.js — Schedule a raid event via the calendar tab and verify
// the event persists across a page reload.
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./helpers");

test("schedule a raid event and verify it persists after reload", async ({ page }) => {
  // --- 1. Log in as the shared admin account ---
  await loginAsAdmin(page);

  // --- 2. Navigate to the Schedule tab ---
  await page.click(".tab-btn[data-tab='schedule']");
  await page.waitForSelector("#schedule-tab:not([hidden])", { timeout: 8000 });

  // Pick a future date (5 days from now)
  const future = new Date();
  future.setDate(future.getDate() + 5);
  const dd = String(future.getDate()).padStart(2, "0");
  const mm = String(future.getMonth() + 1).padStart(2, "0");
  const yyyy = future.getFullYear();
  const futureDDMMYYYY = `${dd}/${mm}/${yyyy}`;

  // Navigate the calendar to the correct month if needed
  // The current month label shows the current month
  const calLabel = await page.textContent("#calendar-month-label");
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const targetMonthName = `${monthNames[future.getMonth()]} ${yyyy}`;

  // Click "Mês Seguinte" if the future date is in the next month
  if (!calLabel.includes(targetMonthName)) {
    await page.click("#btn-next-month");
    await page.waitForFunction(
      (expected) => document.getElementById("calendar-month-label")?.textContent.includes(expected),
      targetMonthName,
      { timeout: 5000 }
    );
  }

  // --- 3. Click the calendar header cell for the target day ---
  // Calendar header cells are <th> elements inside #calendar-thead-row
  // They contain a <div class="cell-day-num"> with the day number
  const dayNum = parseInt(dd);
  const dayCell = page.locator(`#calendar-thead-row th`).filter({
    has: page.locator(`.cell-day-num`, { hasText: String(dayNum) })
  }).first();

  await expect(dayCell).toBeVisible({ timeout: 5000 });

  // Click the day cell to open the schedule modal
  await dayCell.click();

  // Schedule modal should appear
  await page.waitForSelector("#modal-schedule-date:not([hidden])", { timeout: 6000 });
  await expect(page.locator("#modal-sched-title")).toBeVisible();

  // Check if the modal shows a "Confirmar Agendamento" button (no existing event)
  // or "Salvar Alterações" (editing existing event)
  // The button is appended at the bottom of the modal body
  await page.evaluate(() => {
    const body = document.getElementById("modal-sched-body");
    if (body) body.scrollTop = body.scrollHeight;
  });

  const saveBtn = page.locator("#modal-sched-body button.ff-btn-action").last();
  await expect(saveBtn).toBeVisible({ timeout: 5000 });

  // Click the save/confirm button and wait for the state PUT
  const [putRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/state") && r.request().method() === "PUT"
    ),
    saveBtn.click(),
  ]);
  expect(putRes.status()).toBe(200);

  // Modal should close
  await expect(page.locator("#modal-schedule-date")).toBeHidden({ timeout: 6000 });

  // --- 4. Verify the day is now marked as scheduled in the calendar ---
  const scheduledDay = page.locator("#calendar-thead-row th.day-scheduled");
  await expect(scheduledDay).toBeVisible({ timeout: 6000 });

  // --- 5. Reload and verify state persists ---
  await page.reload();
  await page.waitForSelector("#user-pill:not([hidden])", { timeout: 8000 });

  // Navigate to schedule tab — scheduled day should still be marked
  await page.click(".tab-btn[data-tab='schedule']");
  await page.waitForSelector("#schedule-tab:not([hidden])", { timeout: 4000 });

  // Navigate to the right month if needed after reload
  const calLabelAfterReload = await page.textContent("#calendar-month-label");
  if (!calLabelAfterReload.includes(targetMonthName)) {
    await page.click("#btn-next-month");
    await page.waitForFunction(
      (expected) => document.getElementById("calendar-month-label")?.textContent.includes(expected),
      targetMonthName,
      { timeout: 5000 }
    );
  }

  const scheduledDayAfterReload = page.locator("#calendar-thead-row th.day-scheduled");
  await expect(scheduledDayAfterReload).toBeVisible({ timeout: 6000 });
});
