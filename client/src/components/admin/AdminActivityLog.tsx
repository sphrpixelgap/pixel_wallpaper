import { useState } from "react";
import { Activity, ChevronLeft, ChevronRight, History } from "lucide-react";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 25;
const sectionLabels: Record<string, string> = { wallpapers: "والپیپرها", requests: "درخواست‌ها", taxonomy: "دسته‌ها و برچسب‌ها", settings: "تنظیمات سایت", users: "حساب‌های سایت", admins: "مدیران" };
const actionLabels: Record<string, string> = {
  "admin.create": "افزودن والپیپر تازه", "admin.update": "ویرایش والپیپر", "admin.archive": "بایگانی والپیپر", "admin.deletePermanently": "حذف دائمی والپیپر",
  "admin.bulkUpdate": "اعمال تغییر گروهی روی والپیپرها", "admin.setPublicationStatus": "تغییر وضعیت انتشار", "admin.deleteVariant": "حذف نسخهٔ دانلودی", "admin.deleteExtraVariants": "حذف نسخه‌های اضافه",
  "requests.updateStatus": "تغییر وضعیت درخواست", "requests.deletePermanently": "حذف درخواست", "requests.updateIssueReportStatus": "تغییر وضعیت گزارش مشکل",
  "taxonomy.createCategory": "ساخت دسته‌بندی", "taxonomy.renameCategory": "تغییر نام دسته‌بندی", "taxonomy.deleteCategory": "حذف دسته‌بندی", "taxonomy.renameGame": "تغییر نام بازی", "taxonomy.removeGame": "حذف نام بازی", "taxonomy.renameTag": "تغییر نام برچسب", "taxonomy.removeTag": "حذف برچسب",
  "siteSettings.update": "ویرایش تنظیمات سایت", "admin.updateUserRole": "تغییر نقش حساب سایت",
  "adminAuth.changePassword": "تغییر رمز ورود", "adminAuth.updateOwnerCredentials": "تغییر مشخصات مالک", "adminAuth.createAccount": "افزودن مدیر", "adminAuth.updateAccountPermissions": "تغییر دسترسی مدیر", "adminAuth.renameAccount": "تغییر نام کاربری مدیر", "adminAuth.resetAccountPassword": "بازنشانی رمز مدیر", "adminAuth.setAccountActive": "تغییر وضعیت حساب مدیر",
};

export default function AdminActivityLog() {
  const [page, setPage] = useState(1);
  const log = trpc.admin.activityLog.useQuery({ page }, { retry: false, refetchInterval: 30_000 });
  const totalPages = Math.max(1, Math.ceil((log.data?.total ?? 0) / PAGE_SIZE));
  return <section className="admin-panel admin-workflow-panel">
    <div className="admin-top"><div><h2><History size={19} /> تاریخچهٔ تغییرات و فعالیت مدیران</h2><p>ثبت عملیات موفق پنل؛ رمزها و ورودی‌های خصوصی در این تاریخچه نگهداری نمی‌شوند.</p></div><span className="request-total">{(log.data?.total ?? 0).toLocaleString("fa-IR")} رویداد</span></div>
    {log.isLoading ? <div className="loading-line"><span className="spinner" /> در حال دریافت تاریخچه...</div> : log.error ? <div className="notice-box" role="alert">تاریخچه دریافت نشد: {log.error.message}</div> : log.data?.items.length ? <div className="admin-activity-list">{log.data.items.map(item => <article className="admin-activity-row" key={item.id}><span className="admin-activity-icon"><Activity size={15} /></span><div><strong>{actionLabels[item.actionKey] ?? item.actionKey}</strong><small>{item.actorUsername} · {sectionLabels[item.section] ?? item.section}{item.entityId ? ` · شناسهٔ ${item.entityId.toLocaleString("fa-IR")}` : ""}</small></div><time>{new Date(item.createdAt).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}</time></article>)}<div className="admin-list-pagination"><button className="button-secondary" type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}><ChevronRight size={14} /> قبلی</button><span>صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button className="button-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>بعدی <ChevronLeft size={14} /></button></div></div> : <div className="empty-state"><div className="empty-icon"><History size={22} /></div><h3>هنوز رویدادی ثبت نشده</h3><p>تغییرات مدیریتی موفق از این لحظه به بعد در اینجا ثبت می‌شوند.</p></div>}
  </section>;
}
