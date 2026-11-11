import { useState } from "react";
import { AlertTriangle, HeartPulse, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Props = { onEdit: (id: number, title: string) => void };

export default function AdminContentHealth({ onEdit }: Props) {
  const report = trpc.admin.contentHealth.useQuery(undefined, { retry: false });
  const [expanded, setExpanded] = useState<string | null>(null);
  return <section className="admin-panel admin-workflow-panel">
    <div className="admin-top"><div><h2><HeartPulse size={19} /> سلامت محتوای گنجینه</h2><p>موارد زیر پیشنهاد اصلاح‌اند؛ هیچ موردی خودکار تغییر یا حذف نمی‌شود.</p></div></div>
    {report.isLoading ? <div className="loading-line"><span className="spinner" /> در حال بررسی کیفیت داده‌ها...</div> : report.error ? <div className="notice-box" role="alert">گزارش سلامت دریافت نشد: {report.error.message}</div> : <div className="admin-health-list">{report.data?.issues.map(issue => <article className="admin-health-card" key={issue.key}>
      <button className="admin-health-summary" type="button" aria-expanded={expanded === issue.key} onClick={() => setExpanded(current => current === issue.key ? null : issue.key)}><span><AlertTriangle size={16} /> {issue.label}</span><b>{issue.count.toLocaleString("fa-IR")}</b></button>
      {expanded === issue.key && <div className="admin-health-examples">{issue.count ? issue.samples.map(item => <div className="admin-health-example" key={item.id}><span>{item.title}{item.gameTitle ? ` · ${item.gameTitle}` : ""}</span><button className="admin-inline-action" type="button" onClick={() => onEdit(item.id, item.title)}><Pencil size={13} /> ویرایش</button></div>) : <p className="form-hint">موردی با این مشکل پیدا نشد.</p>}{issue.count > issue.samples.length && <small>و { (issue.count - issue.samples.length).toLocaleString("fa-IR")} مورد دیگر…</small>}</div>}
    </article>)}</div>}
  </section>;
}
