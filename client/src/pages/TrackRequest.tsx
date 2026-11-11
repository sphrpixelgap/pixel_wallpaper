import { useState, type FormEvent } from "react";
import { ArrowRight, Clock3, Search } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const statusLabels = { new: "در صف بررسی", reviewed: "بررسی‌شده", completed: "انجام‌شده" } as const;

export default function TrackRequest() {
  const [code, setCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const lookup = trpc.requests.lookup.useQuery({ code: submittedCode }, { enabled: submittedCode.length > 0, retry: false });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedCode(code.trim().replace(/\s+/g, "").toLowerCase());
  }
  return <main className="page-wrap request-page">
    <header className="page-header">
      <Link href="/request" className="eyebrow"><ArrowRight size={14} /> بازگشت به فرم درخواست</Link>
      <h1>پیگیری درخواست</h1>
      <p>کدی را وارد کن که هنگام ثبت درخواست دریافت کردی. برای حفظ حریم خصوصی، فقط وضعیت و زمان ثبت نمایش داده می‌شود.</p>
    </header>
    <form className="request-card tracking-form" onSubmit={submit}>
      <div className="form-field"><label htmlFor="request-tracking-code">کد پیگیری</label><input id="request-tracking-code" dir="ltr" autoComplete="off" spellCheck={false} maxLength={64} value={code} onChange={event => setCode(event.target.value)} placeholder="مثلاً 32 کاراکتر کد پیگیری" required /></div>
      <button className="button-primary" type="submit" disabled={lookup.isFetching}>{lookup.isFetching ? <span className="spinner" /> : <Search size={15} />}{lookup.isFetching ? "در حال جست‌وجو..." : "بررسی وضعیت"}</button>
      {lookup.isError && <p className="error-text" role="alert">{lookup.error.message}</p>}
      {lookup.isSuccess && lookup.data && <section className="tracking-result" role="status" aria-live="polite"><span className={`request-status status-${lookup.data.status}`}>{statusLabels[lookup.data.status]}</span><p><Clock3 size={14} /> ثبت‌شده در {new Date(lookup.data.createdAt).toLocaleString("fa-IR", { dateStyle: "long", timeStyle: "short" })}</p></section>}
      {lookup.isSuccess && !lookup.data && <p className="tracking-not-found" role="status" aria-live="polite">درخواستی با این کد پیدا نشد. کد را بررسی کن و دوباره امتحان کن.</p>}
    </form>
  </main>;
}
