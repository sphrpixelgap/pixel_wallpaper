import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LogIn, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";

type AdminAuthStatus = RouterOutputs["adminAuth"]["status"];

export default function AdminAuthGate({ status }: { status: AdminAuthStatus }) {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const login = trpc.adminAuth.login.useMutation();
  const bootstrap = trpc.adminAuth.bootstrapOwner.useMutation();
  const logout = trpc.adminAuth.logout.useMutation();
  const changePassword = trpc.adminAuth.changePassword.useMutation();

  async function refreshStatus() {
    await utils.adminAuth.status.invalidate();
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    try {
      await login.mutateAsync({ username, password });
      setPassword("");
      await refreshStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ورود انجام نشد."); }
  }

  async function submitBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (newPassword.length < 12) { setError("رمز مالک باید حداقل ۱۲ نویسه باشد."); return; }
    if (newPassword !== confirmPassword) { setError("تکرار رمز با رمز مالک یکسان نیست."); return; }
    try {
      await bootstrap.mutateAsync({ username, password: newPassword });
      setNewPassword(""); setConfirmPassword("");
      await refreshStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "راه‌اندازی حساب مالک انجام نشد."); }
  }

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (newPassword.length < 12) { setError("رمز جدید باید حداقل ۱۲ نویسه باشد."); return; }
    if (newPassword !== confirmPassword) { setError("تکرار رمز جدید یکسان نیست."); return; }
    if (newPassword === currentPassword) { setError("رمز جدید باید با رمز فعلی متفاوت باشد."); return; }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setSuccess("رمز تغییر کرد؛ دسترسی پنل فعال شد.");
      await refreshStatus();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر رمز انجام نشد."); }
  }

  async function signOutAdmin() {
    setError("");
    try { await logout.mutateAsync(); await refreshStatus(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "خروج از پنل انجام نشد."); }
  }

  const isChangingPassword = Boolean(status.account?.mustChangePassword);
  const isBootstrapping = status.setupRequired && status.bootstrapAvailable;
  return <main className="page-wrap admin-auth-page" dir="rtl">
    <header className="page-header"><span className="eyebrow"><ShieldAlert size={14} /> دسترسی مدیریت</span><h1>{isChangingPassword ? "تغییر رمز اولیه" : isBootstrapping ? "راه‌اندازی حساب مالک" : "ورود به پنل مدیران"}</h1><p>ورود این بخش مستقل از ورود کاربران عادی سایت است.</p></header>
    <section className="admin-auth-card">
      {error && <div className="notice-box" role="alert">{error}</div>}
      {success && <p className="success-text" role="status">{success}</p>}

      {isChangingPassword ? <>
        <h2><KeyRound size={18} style={{ verticalAlign: "middle", marginLeft: 8 }} />تغییر اجباری رمز</h2>
        <p>برای ادامهٔ کار، رمز اولیهٔ این حساب مدیر را به رمز شخصی جدید تغییر دهید.</p>
        <form onSubmit={event => void submitPasswordChange(event)}>
          <div className="form-field"><label htmlFor="admin-current-password">رمز فعلی</label><input id="admin-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></div>
          <div className="form-field"><label htmlFor="admin-new-password">رمز جدید (حداقل ۱۲ نویسه)</label><input id="admin-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></div>
          <div className="form-field"><label htmlFor="admin-confirm-password">تکرار رمز جدید</label><input id="admin-confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div>
          <button className="button-primary" type="submit" disabled={changePassword.isPending}><KeyRound size={15} />ذخیرهٔ رمز جدید</button>
        </form>
      </> : isBootstrapping ? <>
        <h2><ShieldCheck size={18} style={{ verticalAlign: "middle", marginLeft: 8 }} />ساخت حساب مالک</h2>
        <p>حساب مالک مستقل از Manus فقط یک‌بار ساخته می‌شود. نام‌کاربری ۳ تا ۳۲ نویسهٔ لاتین/عدد و رمز حداقل ۱۲ نویسه باشد.</p>
        <form onSubmit={event => void submitBootstrap(event)}>
          <div className="form-field"><label htmlFor="owner-bootstrap-username">نام‌کاربری مالک</label><input id="owner-bootstrap-username" value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" autoComplete="username" required /></div>
          <div className="form-field"><label htmlFor="owner-bootstrap-password">رمز مالک</label><input id="owner-bootstrap-password" type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></div>
          <div className="form-field"><label htmlFor="owner-bootstrap-confirm">تکرار رمز مالک</label><input id="owner-bootstrap-confirm" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required /></div>
          <button className="button-primary" type="submit" disabled={bootstrap.isPending}><ShieldCheck size={15} />ساخت حساب امن مالک</button>
        </form>
      </> : <>
        <h2><KeyRound size={18} style={{ verticalAlign: "middle", marginLeft: 8 }} />ورود مدیر</h2>
        <p>نام‌کاربری و رمز اختصاصی پنل را وارد کنید. نام‌کاربری ۳ تا ۳۲ نویسهٔ لاتین/عدد و رمز حداقل ۱۲ نویسه است؛ این اطلاعات از ورود عمومی سایت جداست.</p>
        <form onSubmit={event => void submitLogin(event)}>
          <div className="form-field"><label htmlFor="admin-login-username">نام‌کاربری</label><input id="admin-login-username" value={username} onChange={event => setUsername(event.target.value)} minLength={3} maxLength={32} autoComplete="username" required /></div>
          <div className="form-field"><label htmlFor="admin-login-password">رمز عبور</label><input id="admin-login-password" type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} autoComplete="current-password" required /></div>
          <button className="button-primary" type="submit" disabled={login.isPending}><LogIn size={15} />ورود امن</button>
        </form>
      </>}
      {status.account && <div className="admin-auth-actions"><button className="button-secondary" type="button" onClick={() => void signOutAdmin()} disabled={logout.isPending}>خروج از پنل</button></div>}
    </section>
    <Link className="button-secondary" href="/" style={{ marginTop: 14 }}><ArrowLeft size={15} />بازگشت به سایت</Link>
  </main>;
}
