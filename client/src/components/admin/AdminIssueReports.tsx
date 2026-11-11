import { useState } from "react";
import { Bug, ChevronLeft, ChevronRight, MessageSquareWarning } from "lucide-react";
import { trpc } from "@/lib/trpc";

const PAGE_SIZE = 20;
const reasonLabels = { download: "مشکل دانلود", quality: "کیفیت تصویر", wrong_info: "اطلاعات نادرست", duplicate: "تصویر تکراری", other: "سایر" } as const;
const statusLabels = { new: "جدید", reviewed: "بررسی‌شده", resolved: "حل‌شده", dismissed: "نادیده‌گرفته‌شده" } as const;

type Status = keyof typeof statusLabels;

export default function AdminIssueReports() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status | "all">("new");
  const [error, setError] = useState("");
  const reports = trpc.requests.issueReportsPage.useQuery({ page, status: status === "all" ? undefined : status }, { retry: false });
  const update = trpc.requests.updateIssueReportStatus.useMutation();
  const totalPages = Math.max(1, Math.ceil((reports.data?.total ?? 0) / PAGE_SIZE));
  const setReportStatus = async (id: number, next: Status) => {
    setError("");
    try { await update.mutateAsync({ id, status: next }); await Promise.all([reports.refetch(), utils.admin.actionableStats.invalidate(), utils.admin.overview.invalidate()]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "به‌روزرسانی گزارش انجام نشد."); }
  };
  return <section className="admin-panel admin-workflow-panel">
    <div className="admin-top"><div><h2><MessageSquareWarning size={19} /> گزارش‌های مشکل والپیپر</h2><p>گزارش‌های کاربران بدون ذخیرهٔ اطلاعات تماس یا IP خام نگهداری می‌شوند.</p></div><span className="request-total">{(reports.data?.total ?? 0).toLocaleString("fa-IR")} گزارش</span></div>
    <label className="admin-filter-label">فیلتر وضعیت <select value={status} onChange={event => { setStatus(event.target.value as Status | "all"); setPage(1); }}><option value="new">جدید</option><option value="reviewed">بررسی‌شده</option><option value="resolved">حل‌شده</option><option value="dismissed">نادیده‌گرفته‌شده</option><option value="all">همهٔ وضعیت‌ها</option></select></label>
    {error && <p className="error-text" role="alert">{error}</p>}
    {reports.isLoading ? <div className="loading-line"><span className="spinner" /> در حال دریافت گزارش‌ها...</div> : reports.error ? <div className="notice-box" role="alert">گزارش‌ها دریافت نشدند: {reports.error.message}</div> : reports.data?.items.length ? <div className="admin-issue-list">{reports.data.items.map(item => <article className="admin-issue-card" key={item.id}>
      <div className="admin-issue-heading"><div><strong>{item.wallpaperTitle}</strong><small>شناسهٔ والپیپر: {item.wallpaperId.toLocaleString("fa-IR")} · گزارش #{item.id.toLocaleString("fa-IR")}</small></div><span className={`request-status status-${item.status === "new" ? "new" : item.status === "reviewed" ? "reviewed" : "completed"}`}>{statusLabels[item.status]}</span></div>
      <p><Bug size={14} /> {reasonLabels[item.reason]}</p>{item.details && <blockquote>{item.details}</blockquote>}
      <div className="admin-issue-footer"><time>{new Date(item.createdAt).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}</time><label>وضعیت <select value={item.status} disabled={update.isPending} onChange={event => void setReportStatus(item.id, event.target.value as Status)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    </article>)}<div className="admin-list-pagination"><button className="button-secondary" type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}><ChevronRight size={14} /> قبلی</button><span>صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button className="button-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>بعدی <ChevronLeft size={14} /></button></div></div> : <div className="empty-state"><div className="empty-icon"><MessageSquareWarning size={22} /></div><h3>گزارشی در این فیلتر نیست</h3><p>با ثبت گزارش‌های تازه، موارد برای بررسی در اینجا نمایش داده می‌شوند.</p></div>}
  </section>;
}
