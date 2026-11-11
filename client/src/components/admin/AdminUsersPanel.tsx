import { useState } from "react";
import { Shield, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Role = "user" | "admin" | "blocked";
const labels: Record<Role, string> = { user: "کاربر", admin: "مدیر", blocked: "مسدود" };
function dateLabel(value: Date | string | null | undefined) { if (!value) return "ثبت نشده"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "نامشخص" : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); }
export default function AdminUsersPanel({ isOwner }: { isOwner: boolean }) {
  const [page, setPage] = useState(1);
  const query = trpc.admin.users.useQuery({ page });
  const utils = trpc.useUtils();
  const mutation = trpc.admin.updateUserRole.useMutation();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 25));
  const roleOptions: Role[] = isOwner ? ["user", "admin", "blocked"] : ["user", "blocked"];
  const update = async (id: number, name: string, role: Role) => {
    const verb = role === "blocked" ? "مسدود شود" : role === "admin" ? "به مدیر ارتقا یابد" : "به کاربر عادی تغییر کند";
    if (!window.confirm(`نقش ${name} تغییر کند و ${verb}؟ این تغییر فقط روی دسترسی Pixel Wallpaper اثر دارد و حساب Manus را حذف نمی‌کند.`)) return;
    setError(""); setSuccess(""); setBusyId(id);
    try { await mutation.mutateAsync({ id, role }); await utils.admin.users.invalidate(); setSuccess("نقش کاربر با موفقیت به‌روزرسانی شد."); }
    catch (e) { setError(e instanceof Error ? e.message : "به‌روزرسانی نقش ناموفق بود."); }
    finally { setBusyId(null); }
  };
  return <section className="admin-panel" dir="rtl"><div className="admin-top"><div><h2><Users size={18} style={{ verticalAlign: "middle", marginLeft: 8 }} />مدیریت کاربران</h2><p>نقش‌ها فقط دسترسی به Pixel Wallpaper را کنترل می‌کنند؛ حساب Manus حذف نمی‌شود. انتخاب «مسدود» دسترسی به برنامه را غیرفعال می‌کند.{!isOwner && " تعیین یا تغییر نقش مدیر فقط برای مالک مجاز است."}</p></div></div>
    {error && <div className="notice-box" role="alert">{error}</div>}{success && <p className="success-text" role="status">{success}</p>}
    {query.isLoading ? <div className="loading-line">در حال دریافت کاربران…</div> : query.error ? <div className="notice-box" role="alert">دریافت کاربران ناموفق بود: {query.error.message}</div> : query.data?.items.length ? <><div className="admin-list">{query.data.items.map(row => {
      const own = row.isOwner;
      const roleValue: Role = row.role === "blocked" ? "blocked" : row.effectiveAdmin ? "admin" : "user";
      return <article className="admin-row" key={row.id}><div className="admin-row-main"><strong>{row.name || "بدون نام"}{own && <span style={{ display: "inline", marginRight: 8, color: "#c5a3f5" }}>· حساب شما</span>}</strong><span dir="ltr" style={{ textAlign: "right" }}>{row.email || "بدون ایمیل"}</span><span>نقش فعلی: {labels[roleValue]} · آخرین ورود: {dateLabel(row.lastSignedIn)}</span><span>عضویت: {dateLabel(row.createdAt)}</span>
        {row.isConfiguredAdmin && <span style={{ color: "#e9bd73", whiteSpace: "normal" }}><Shield size={13} style={{ verticalAlign: "middle", marginLeft: 4 }} />این ایمیل در فهرست مجاز Manus است؛ ورود جدید پنل با حساب‌های مستقل بخش «مدیران» انجام می‌شود.</span>}
        {!own && !row.isOwner && (isOwner || !row.effectiveAdmin) && <div className="form-field" style={{ maxWidth: 220, marginTop: 10 }}><label htmlFor={`role-${row.id}`}>تغییر نقش</label><select id={`role-${row.id}`} value={roleValue} disabled={mutation.isPending || busyId === row.id} onChange={e => void update(row.id, row.name || row.email || `#${row.id}`, e.target.value as Role)}>{roleOptions.map(role => <option value={role} key={role}>{labels[role]}</option>)}</select></div>}
      </div></article>;
    })}</div>{totalPages > 1 && <div className="request-pagination"><button className="button-secondary" type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>قبلی</button><span>{(query.data.total).toLocaleString("fa-IR")} حساب · صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button className="button-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>بعدی</button></div>}</> : <div className="empty-state"><div className="empty-icon"><Users size={22} /></div><h3>کاربری برای نمایش وجود ندارد</h3></div>}
  </section>;
}
