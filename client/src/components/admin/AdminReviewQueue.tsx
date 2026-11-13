import { useState } from "react";
import { Archive, Check, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getResponsiveImageSource } from "@/lib/imagekit";

export default function AdminReviewQueue() {
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const queue = trpc.admin.reviewQueue.useQuery({ page }, { retry: false });
  const setStatus = trpc.admin.setPublicationStatus.useMutation();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const updateStatus = async (id: number, status: "draft" | "published", title: string) => {
    setMessage(""); setError("");
    try {
      await setStatus.mutateAsync({ id, status });
      setMessage(status === "published" ? `«${title}» منتشر شد.` : `«${title}» به پیش‌نویس بازگشت.`);
      await Promise.all([
        queue.refetch(), utils.admin.overview.invalidate(), utils.admin.actionableStats.invalidate(),
        utils.admin.listPage.invalidate(), utils.wallpapers.page.invalidate(), utils.wallpapers.list.invalidate(), utils.games.list.invalidate(),
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تغییر وضعیت انتشار انجام نشد."); }
  };
  const totalPages = Math.max(1, Math.ceil((queue.data?.total ?? 0) / 20));
  return <section className="admin-panel admin-workflow-panel">
    <div className="admin-top"><div><h2><Check size={19} /> صف بازبینی محتوا</h2><p>والپیپرهای تازه تا زمان تأیید در فهرست عمومی و جست‌وجو نمایش داده نمی‌شوند.</p></div><span className="request-total">{(queue.data?.total ?? 0).toLocaleString("fa-IR")} در انتظار</span></div>
    {message && <p className="success-text" role="status">{message}</p>}{error && <p className="error-text" role="alert">{error}</p>}
    {queue.isLoading ? <div className="loading-line"><span className="spinner" /> در حال دریافت صف...</div> : queue.error ? <div className="notice-box" role="alert">صف بازبینی دریافت نشد: {queue.error.message}</div> : queue.data?.items.length ? <div className="admin-review-list">{queue.data.items.map(item => <article className="admin-review-card" key={item.id}>
      <img src={getResponsiveImageSource(item.thumbnailUrl || item.imageUrl, [320], { quality: 80, maxWidth: 480 }).src} alt={`پیش‌نمایش ${item.title}`} loading="lazy" />
      <div className="admin-review-copy"><div className="admin-review-heading"><strong>{item.title}</strong><span>منتظر بررسی</span></div>{item.communitySubmission && <div className="community-review-meta"><strong>ارسال‌شده توسط کاربر</strong>{item.communitySubmission.sourceUrl && <a href={item.communitySubmission.sourceUrl} target="_blank" rel="noopener noreferrer">مشاهدهٔ منبع</a>}<small>حق انتشار هنگام ارسال تأیید شده است.</small></div>}<p>{[item.gameTitle, item.category, item.resolution, item.width && item.height ? `${item.width}×${item.height}` : "ابعاد ثبت‌نشده"].filter(Boolean).join(" · ")}</p>{item.description && <p className="admin-review-description">{item.description}</p>}<small>ثبت: {new Date(item.createdAt).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}</small>
      <div className="admin-review-actions"><button className="button-primary" type="button" disabled={setStatus.isPending} onClick={() => void updateStatus(item.id, "published", item.title)}><Check size={15} /> تأیید و انتشار</button><button className="button-secondary" type="button" disabled={setStatus.isPending} onClick={() => void updateStatus(item.id, "draft", item.title)}><RotateCcw size={15} /> نگه‌داری به‌صورت پیش‌نویس</button></div></div>
    </article>)}{totalPages > 1 && <div className="admin-list-pagination"><button className="button-secondary" type="button" disabled={page <= 1} onClick={() => setPage(current => current - 1)}><ChevronRight size={14} /> قبلی</button><span>صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button className="button-secondary" type="button" disabled={page >= totalPages} onClick={() => setPage(current => current + 1)}>بعدی <ChevronLeft size={14} /></button></div>}</div> : <div className="empty-state"><div className="empty-icon"><Archive size={22} /></div><h3>صف بازبینی خالی است</h3><p>مورد تازه‌ای منتظر تأیید نیست.</p></div>}
  </section>;
}
