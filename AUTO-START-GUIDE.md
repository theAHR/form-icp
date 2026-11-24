# ICP form system — auto-start & recovery

This guide is for the Windows server at `C:\ICP`. If the membership app does not come up after a reboot, follow these steps in order.

## How auto-start works

1. **PostgreSQL** starts with Windows (service **Automatic**, e.g. `postgresql-x64-17`).
2. After **someone signs in to Windows** on the server PC, Task Scheduler runs **`ICP-Membership-AutoStart`** about **1 minute** later.
3. The script waits for PostgreSQL, then starts the app on **port 3000**.

**Important:** Auto-start does **not** run while the PC is sitting at the login screen. Someone must log in (or configure Windows auto-logon for the server account).

Initial setup (once):

```bat
cd /d C:\ICP\form-system\scripts\windows
install-autostart.cmd
```

---

## 1. Start manually (fastest fix)

```bat
cd /d C:\ICP\form-system\scripts\windows
start-all.cmd
```

If the site loads, the app is fine and only auto-start failed.

---

## 2. Check the logs

| File | Purpose |
| --- | --- |
| `C:\ICP\logs\icp-startup.log` | Autostart steps: DB wait, stop old processes, port 3000 |
| `C:\ICP\logs\icp-app.log` | Output from `npm start` / Node errors |

Common messages:

- PostgreSQL did not become ready → database service slow or stopped.
- `.env not found` → missing config in `C:\ICP\form-system`.
- Did not listen on port 3000 → see `icp-app.log` for the real error.

---

## 3. Check PostgreSQL

1. Press `Win + R`, type `services.msc`, Enter.
2. Find **postgresql-x64-17** (or your installed version).
3. **Status** must be **Running**; **Startup type** **Automatic**.

If it is stopped: **Start** the service, wait ~30 seconds, run `start-all.cmd` again.

---

## 4. Check Task Scheduler

1. Open **Task Scheduler**.
2. Task name: **`ICP-Membership-AutoStart`**.
3. Confirm:
   - State **Ready** (not Disabled).
   - Trigger: **At log on** for the server user, with **1 minute** delay.
   - **Last Run Result** `0x0` = success; other codes = failure (check **History** if enabled).

Remember: the task runs **after logon**, not at the lock screen.

---

## 5. Reinstall auto-start

If the task is missing, disabled, or misconfigured:

```bat
cd /d C:\ICP\form-system\scripts\windows
install-autostart.cmd
```

Then sign out and sign in again, or reboot and log in, to test.

---

## 6. Common problems

| Symptom | What to do |
| --- | --- |
| Site does not open on the server | Run `start-all.cmd`; read `icp-app.log` |
| Database connection error | Fix PostgreSQL + `DATABASE_URL` password in `C:\ICP\form-system\.env` |
| Port 3000 already in use | Run `stop-all.ps1` from `scripts\windows`, then `start-all.cmd` |
| Works on server, not on other PCs | Firewall rule for port 3000, network profile **Private**, correct `APP_URL` in `.env` |
| Nothing after reboot, no log lines | No one logged in → log in to Windows, or set up auto-logon |

Stop all ICP processes (PowerShell):

```powershell
& C:\ICP\form-system\scripts\windows\stop-all.ps1
```

---

## 7. After updating the project

From `C:\ICP\form-system`:

```bat
npm run build
npm run db:migrate
```

Then run `start-all.cmd`. Auto-start uses the same `start-icp.ps1` logic.

Do **not** run `npm run db:seed` on a production server with real data unless you intend to re-seed.

---

## Quick checklist

1. Run `start-all.cmd`
2. Read `C:\ICP\logs\icp-startup.log`
3. PostgreSQL **Running** + **Automatic**
4. Task **`ICP-Membership-AutoStart`** exists and is enabled
5. **Log in to Windows** after boot
6. Run `install-autostart.cmd` if the task is broken or missing

---

## Related docs

- Full Windows deployment: [form-system/docs/DEPLOY-WINDOWS.fa.md](form-system/docs/DEPLOY-WINDOWS.fa.md) (مرحلهٔ ۱۱ — اجرای خودکار)
