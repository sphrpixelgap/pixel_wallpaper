import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Shield, Trash2, UserPlus, UserRoundCog, UserRoundX } from "lucide-react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import AdminPermissionEditor from "@/components/admin/AdminPermissionEditor";
import { NO_ADMIN_PERMISSIONS, type AdminPermissions } from "@shared/admin-permissions";

type ManagedAccount = RouterOutputs["adminAuth"]["accounts"][number];

function dateLabel(value: Date | string | null | undefined) {
  if (!value) return "هنوز وارد نشده";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "نامشخص" : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function ManagedAdminRow({
  account,
  onRename,
  onResetPassword,
  onToggle,
  onDelete,
  onUpdatePermissions,
  busy,
}: {
  account: ManagedAccount;
  onRename: (id: number, username: string) => Promise<void>;
  onResetPassword: (id: number, password: string) => Promise<void>;
  onToggle: (id: number, active: boolean) => Promise<void>;
  onDelete: (id: number, username: string) => Promise<void>;
  onUpdatePermissions: (id: number, permissions: AdminPermissions) => Promise<void>;
  busy: boolean;
}) {
  const [username, setUsername] = useState(account.username);
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<AdminPermissions>(account.permissions);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => setUsername(account.username), [account.username]);
  useEffect(() => setPermissions(account.permissions), [account.permissions]);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    try { await onRename(account.id, username); setNotice("نام‌کاربری ذخیره شد."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیرهٔ نام‌کاربری انجام نشد."); }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    if (password.length < 12) { setError("رمز باید حداقل ۱۲ نویسه باشد."); return; }
    if (!window.confirm(`رمز «${account.username}» بازنشانی شود؟ نشست‌های قبلی بسته می‌شوند و مدیر در ورود بعدی باید رمز را تغییر دهد.`)) return;
    try { await onResetPassword(account.id, password); setPassword(""); setNotice("رمز تازه ثبت شد؛ آن را امن به مدیر تحویل دهید. دوباره نمایش داده نمی‌شود."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "بازنشانی رمز انجام نشد."); }
  }

  async function toggle() {
    const next = account.isActive !== 1;
    if (!next && !window.confirm(`دسترسی «${account.username}» غیرفعال شود؟ نشست‌های فعال او نیز لغو می‌شوند.`)) return;
    setError(""); setNotice("");
    try { await onToggle(account.id, next); setNotice(next ? "حساب مدیر فعال شد." : "دسترسی مدیر غیرفعال و نشست‌ها لغو شد."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر وضعیت حساب انجام نشد."); }
  }

  async function removeAccount() {
    const confirmed = window.confirm(`حساب مدیر «${account.username}» برای همیشه حذف شود؟ این کار برگشت‌ناپذیر است و همهٔ نشست‌های فعال او فوراً لغو می‌شوند.`);
    if (!confirmed) return;
    setError(""); setNotice("");
    await onDelete(account.id, account.username);
  }

  async function savePermissions() {
    setError(""); setNotice("");
    try {
      await onUpdatePermissions(account.id, permissions);
      setNotice("دسترسی‌ها ذخیره شدند و از درخواست بعدی اعمال می‌شوند.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیرهٔ دسترسی‌ها انجام نشد."); }
  }

  const permissionsChanged = Object.keys(permissions).some(key => permissions[key as keyof AdminPermissions] !== account.permissions[key as keyof AdminPermissions]);

  return <article className="admin-manager-row">
    <div className="admin-manager-heading">
      <div><strong dir="ltr">{account.username}</strong><span>{account.isActive === 1 ? "فعال" : "غیرفعال"} · آخرین ورود: {dateLabel(account.lastLoginAt)}</span></div>
      <span className={account.mustChangePassword === 1 ? "admin-manager-badge warning" : "admin-manager-badge"}>{account.mustChangePassword === 1 ? "تغییر رمز در ورود بعدی" : "رمز تنظیم‌شده"}</span>
    </div>
    <div className="admin-manager-actions">
      <form onSubmit={event => void rename(event)} className="admin-manager-inline-form">
        <label htmlFor={`admin-username-${account.id}`}>نام‌کاربری</label>
        <div><input id={`admin-username-${account.id}`} value={username} onChange={event => setUsername(event.target.value)} autoComplete="off" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" required /><button className="button-secondary" type="submit" disabled={busy || username.trim().toLowerCase() === account.username}>ذخیره</button></div>
      </form>
      <form onSubmit={event => void reset(event)} className="admin-manager-inline-form">
        <label htmlFor={`admin-password-${account.id}`}>رمز جدید مدیر</label>
        <div><input id={`admin-password-${account.id}`} type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} placeholder="حداقل ۱۲ نویسه" required /><button className="button-secondary" type="submit" disabled={busy}>بازنشانی رمز</button></div>
      </form>
      <button className={account.isActive === 1 ? "admin-manager-toggle is-active" : "admin-manager-toggle"} type="button" disabled={busy} onClick={() => void toggle()}>{account.isActive === 1 ? <><UserRoundX size={15} /> غیرفعال‌کردن</> : <><Shield size={15} /> فعال‌کردن</>}</button>
      <button className="admin-manager-delete" type="button" disabled={busy} onClick={() => void removeAccount()}><Trash2 size={15} /> حذف کامل حساب</button>
    </div>
    <AdminPermissionEditor idPrefix={`admin-permissions-${account.id}`} value={permissions} onChange={setPermissions} disabled={busy} />
    <button className="button-secondary admin-permission-save" type="button" onClick={() => void savePermissions()} disabled={busy || !permissionsChanged}>ذخیرهٔ دسترسی‌های مدیر</button>
    {error && <p className="error-text" role="alert">{error}</p>}
    {notice && <p className="success-text" role="status">{notice}</p>}
  </article>;
}

export default function AdminAccountsPanel() {
  const utils = trpc.useUtils();
  const status = trpc.adminAuth.status.useQuery(undefined, { retry: false });
  const accounts = trpc.adminAuth.accounts.useQuery(undefined, { retry: false });
  const createAccount = trpc.adminAuth.createAccount.useMutation();
  const updateAccountPermissions = trpc.adminAuth.updateAccountPermissions.useMutation();
  const renameAccount = trpc.adminAuth.renameAccount.useMutation();
  const resetAccountPassword = trpc.adminAuth.resetAccountPassword.useMutation();
  const setAccountActive = trpc.adminAuth.setAccountActive.useMutation();
  const deleteAccount = trpc.adminAuth.deleteAccount.useMutation();
  const updateOwnerCredentials = trpc.adminAuth.updateOwnerCredentials.useMutation();
  const [ownerUsername, setOwnerUsername] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPermissions, setNewPermissions] = useState<AdminPermissions>({ ...NO_ADMIN_PERMISSIONS });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (status.data?.account?.role === "owner") setOwnerUsername(current => current || status.data!.account!.username);
  }, [status.data?.account?.id, status.data?.account?.username, status.data?.account?.role]);

  async function saveOwnerCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (ownerPassword && ownerPassword.length < 12) { setError("رمز مالک باید حداقل ۱۲ نویسه باشد."); return; }
    try {
      await updateOwnerCredentials.mutateAsync({ username: ownerUsername.trim() || undefined, password: ownerPassword || undefined });
      setOwnerPassword(""); setSuccess("اطلاعات ورود مالک به‌روزرسانی شد.");
      await Promise.all([utils.adminAuth.status.invalidate(), utils.adminAuth.accounts.invalidate()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "به‌روزرسانی اطلاعات مالک انجام نشد."); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (newPassword.length < 12) { setError("رمز اولیه باید حداقل ۱۲ نویسه باشد."); return; }
    if (newPassword !== confirmPassword) { setError("تکرار رمز با رمز اولیه یکسان نیست."); return; }
    try {
      await createAccount.mutateAsync({ username: newUsername, password: newPassword, permissions: newPermissions });
      setNewUsername(""); setNewPassword(""); setConfirmPassword("");
      setNewPermissions({ ...NO_ADMIN_PERMISSIONS });
      setSuccess("حساب مدیر ساخته شد. فقط بخش‌های انتخاب‌شده فعال هستند؛ رمز فقط همین‌بار وارد شد و آن را امن به مدیر تحویل دهید.");
      await utils.adminAuth.accounts.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ساخت حساب مدیر انجام نشد."); }
  }

  async function withBusy(id: number, action: () => Promise<void>) {
    setBusyId(id); setError(""); setSuccess("");
    try { await action(); await utils.adminAuth.accounts.invalidate(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "عملیات حساب مدیر انجام نشد."); }
    finally { setBusyId(null); }
  }

  const adminAccounts = accounts.data?.filter(account => account.role === "admin") ?? [];
  return <section className="admin-panel admin-managers-panel" dir="rtl">
    <div className="admin-top"><div><h2><UserRoundCog size={19} style={{ verticalAlign: "middle", marginLeft: 8 }} />مدیریت مدیران</h2><p>فقط مالک می‌تواند حساب مدیر بسازد، اطلاعات ورود و دسترسی را مدیریت کند یا حساب را به‌طور کامل حذف کند.</p></div></div>
    {error && <div className="notice-box" role="alert">{error}</div>}
    {success && <p className="success-text" role="status">{success}</p>}
    <div className="admin-managers-grid">
      <section className="admin-form">
        <h3><KeyRound size={16} style={{ verticalAlign: "middle", marginLeft: 7 }} />اطلاعات ورود مالک</h3>
        <p className="form-hint">برای بازیابی اضطراری، حساب Manus مالک نیز محفوظ است. نام‌کاربری ۳ تا ۳۲ حرف/عدد لاتین است؛ رمز فعلی یا رمز مدیران دیگر نمایش داده نمی‌شود.</p>
        <form onSubmit={event => void saveOwnerCredentials(event)}>
          <div className="form-field"><label htmlFor="owner-admin-username">نام‌کاربری مالک</label><input id="owner-admin-username" value={ownerUsername} onChange={event => setOwnerUsername(event.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" autoComplete="username" /></div>
          <div className="form-field"><label htmlFor="owner-admin-password">رمز جدید مالک (اختیاری)</label><input id="owner-admin-password" type="password" value={ownerPassword} onChange={event => setOwnerPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" placeholder="حداقل ۱۲ نویسه" /></div>
          <button className="button-primary" type="submit" disabled={updateOwnerCredentials.isPending || (!ownerUsername.trim() && !ownerPassword)}>ذخیره اطلاعات مالک</button>
        </form>
      </section>
      <section className="admin-form">
        <h3><UserPlus size={16} style={{ verticalAlign: "middle", marginLeft: 7 }} />ساخت مدیر جدید</h3>
        <p className="form-hint">نام‌کاربری ۳ تا ۳۲ نویسهٔ لاتین/عدد است؛ رمز اولیه حداقل ۱۲ نویسه دارد، فقط یک‌بار وارد می‌شود و مدیر در اولین ورود مجبور به تغییر آن است.</p>
        <form onSubmit={event => void create(event)}>
          <div className="form-field"><label htmlFor="new-admin-username">نام‌کاربری مدیر</label><input id="new-admin-username" value={newUsername} onChange={event => setNewUsername(event.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" autoComplete="off" required /></div>
          <div className="form-field"><label htmlFor="new-admin-password">رمز اولیه</label><input id="new-admin-password" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></div>
          <div className="form-field"><label htmlFor="new-admin-confirm">تکرار رمز اولیه</label><input id="new-admin-confirm" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></div>
          <AdminPermissionEditor idPrefix="new-admin-permissions" value={newPermissions} onChange={setNewPermissions} disabled={createAccount.isPending} />
          <button className="button-primary" type="submit" disabled={createAccount.isPending}><UserPlus size={15} />افزودن مدیر</button>
        </form>
      </section>
    </div>
    <div className="admin-manager-list-heading"><h3>مدیران ثبت‌شده</h3><span>{adminAccounts.length.toLocaleString("fa-IR")} حساب</span></div>
    {accounts.isLoading ? <div className="loading-line"><span className="spinner" /> در حال دریافت حساب‌ها...</div> : accounts.error ? <div className="notice-box" role="alert">دریافت مدیران انجام نشد: {accounts.error.message}</div> : adminAccounts.length ? <div className="admin-manager-list">
      {adminAccounts.map(account => <ManagedAdminRow key={account.id} account={account} busy={busyId === account.id || renameAccount.isPending || resetAccountPassword.isPending || setAccountActive.isPending || deleteAccount.isPending || updateAccountPermissions.isPending}
        onRename={(id, username) => withBusy(id, async () => { await renameAccount.mutateAsync({ id, username }); })}
        onResetPassword={(id, password) => withBusy(id, async () => { await resetAccountPassword.mutateAsync({ id, password }); })}
        onUpdatePermissions={(id, permissions) => withBusy(id, async () => { await updateAccountPermissions.mutateAsync({ id, permissions }); })}
        onDelete={(id, username) => withBusy(id, async () => { await deleteAccount.mutateAsync({ id }); setSuccess(`حساب مدیر «${username}» به‌طور کامل حذف شد و نشست‌هایش لغو شدند.`); })}
        onToggle={(id, active) => withBusy(id, async () => { await setAccountActive.mutateAsync({ id, active }); })} />)}
    </div> : <div className="empty-state"><div className="empty-icon"><UserPlus size={22} /></div><h3>هنوز مدیر دیگری اضافه نشده</h3><p>از فرم بالا یک حساب مستقل برای مدیر جدید بسازید.</p></div>}
  </section>;
}
