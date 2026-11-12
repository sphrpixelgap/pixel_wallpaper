import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ImagePlus, Send } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export default function SubmitWallpaper() {
  const categories = trpc.taxonomy.categories.useQuery(undefined, { retry: false });
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [gameTitle, setGameTitle] = useState("");
  const [tags, setTags] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (website.trim()) { setSubmitted(true); return; }
    if (!file) { setError("ابتدا یک تصویر انتخاب کنید."); return; }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) { setError("فقط تصویر PNG، JPG یا WEBP پذیرفته می‌شود."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError("حجم تصویر نباید بیشتر از ۱۲ مگابایت باشد."); return; }
    if (!rightsAccepted) { setError("برای ارسال، تأیید حق استفاده از تصویر لازم است."); return; }

    setSubmitting(true);
    try {
      const response = await fetch("/api/community/wallpapers", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type,
          "X-Wallpaper-Submission": JSON.stringify({
            title: title.trim(), category, gameTitle: gameTitle.trim(), tags: tags.trim(),
            description: description.trim(), sourceUrl: sourceUrl.trim(), rightsAccepted, website,
          }),
        },
        body: file,
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "ارسال تصویر انجام نشد؛ کمی بعد دوباره تلاش کنید.");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ارسال تصویر انجام نشد؛ کمی بعد دوباره تلاش کنید.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setTitle(""); setCategory(""); setGameTitle(""); setTags(""); setDescription("");
    setSourceUrl(""); setFile(null); setRightsAccepted(false); setSubmitted(false); setError("");
  }

  return <main className="page-wrap request-page community-submit-page">
    <header className="page-header">
      <span className="eyebrow"><i /> سهمی از گنجینهٔ والپیپرها</span>
      <h1>والپیپرت را با جامعه به اشتراک بگذار</h1>
      <p>تصویرت را بفرست؛ مدیران آن را بررسی می‌کنند و فقط پس از تأیید در سایت منتشر می‌شود.</p>
    </header>

    {submitted ? <section className="request-success" role="status">
      <div className="empty-icon"><CheckCircle2 size={25} /></div>
      <h2>تصویرت در صف بررسی است</h2>
      <p>ممنون از مشارکتت. فایل تا زمان تصمیم مدیر خصوصی می‌ماند و در فهرست عمومی، جست‌وجو یا دانلود نمایش داده نمی‌شود.</p>
      <div className="request-success-actions">
        <button className="button-primary" type="button" onClick={resetForm}>ارسال والپیپر دیگر</button>
        <Link className="button-secondary" href="/">بازگشت به والپیپرها</Link>
      </div>
    </section> : <form className="request-card community-submit-card" onSubmit={event => void submit(event)}>
      <div className="request-form-grid">
        <div className="form-field">
          <label htmlFor="community-title">عنوان والپیپر</label>
          <input id="community-title" value={title} disabled={submitting} onChange={event => setTitle(event.target.value)} minLength={2} maxLength={180} required placeholder="عنوانی کوتاه و روشن" />
        </div>
        <div className="form-field">
          <label htmlFor="community-category">دسته‌بندی</label>
          <select id="community-category" value={category} disabled={submitting || categories.isLoading || !categories.data?.length} onChange={event => setCategory(event.target.value)} required>
            <option value="">انتخاب دسته‌بندی</option>
            {(categories.data ?? []).map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          {categories.error && <small className="error-text">دسته‌بندی‌ها دریافت نشد؛ صفحه را تازه‌سازی کنید.</small>}
        </div>
        <div className="form-field">
          <label htmlFor="community-game">نام بازی یا موضوع (اختیاری)</label>
          <input id="community-game" value={gameTitle} disabled={submitting} onChange={event => setGameTitle(event.target.value)} maxLength={160} placeholder="مثلاً Elden Ring" />
        </div>
        <div className="form-field">
          <label htmlFor="community-tags">برچسب‌ها (اختیاری)</label>
          <input id="community-tags" value={tags} disabled={submitting} onChange={event => setTags(event.target.value)} maxLength={500} placeholder="تاریک، فانتزی، شب" />
        </div>
        <div className="form-field">
          <label htmlFor="community-source">پیوند منبع یا صفحهٔ سازنده (اختیاری)</label>
          <input id="community-source" type="url" inputMode="url" value={sourceUrl} disabled={submitting} onChange={event => setSourceUrl(event.target.value)} maxLength={1024} placeholder="https://…" />
          <small>این پیوند فقط برای بررسی مدیران است و به‌صورت عمومی نمایش داده نمی‌شود.</small>
        </div>
        <div className="form-field request-details-field">
          <label htmlFor="community-description">توضیحات (اختیاری)</label>
          <textarea id="community-description" value={description} disabled={submitting} onChange={event => setDescription(event.target.value)} maxLength={1200} placeholder="اطلاعاتی دربارهٔ تصویر یا نسخهٔ بازی بنویس…" />
        </div>
        <div className="form-field community-file-field">
          <label htmlFor="community-image">فایل تصویر</label>
          <input id="community-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={submitting} onChange={event => { const selected = event.target.files?.[0] ?? null; setError(""); if (selected && !ACCEPTED_IMAGE_TYPES.has(selected.type)) { setFile(null); setError("فقط تصویر PNG، JPG یا WEBP پذیرفته می‌شود."); event.target.value = ""; return; } if (selected && selected.size > MAX_IMAGE_BYTES) { setFile(null); setError("حجم تصویر نباید بیشتر از ۱۲ مگابایت باشد."); event.target.value = ""; return; } setFile(selected); }} required />
          <small>PNG، JPG یا WEBP؛ حداکثر ۱۲ مگابایت. تصویر در سرور بررسی و بهینه می‌شود.</small>
          {previewUrl && <div className="community-image-preview"><img src={previewUrl} alt="پیش‌نمایش والپیپر انتخاب‌شده" /><span><ImagePlus size={15} /> پیش‌نمایش انتخاب</span></div>}
        </div>
      </div>
      <div className="request-honeypot" aria-hidden="true"><label htmlFor="community-website">وب‌سایت</label><input id="community-website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></div>
      <label className="community-rights-check" htmlFor="community-rights">
        <input id="community-rights" type="checkbox" checked={rightsAccepted} disabled={submitting} onChange={event => setRightsAccepted(event.target.checked)} required />
        <span>تأیید می‌کنم مالک تصویر هستم یا از صاحب حق اجازه دارم؛ و اجازه می‌دهم تصویر برای بررسی خصوصی ذخیره، به WebP تبدیل و thumbnail ساخته شود و در صورت تأیید مدیر به‌صورت عمومی نمایش داده شود. مسئولیت حق استفاده از تصویر با من است.</span>
      </label>
      <p className="request-privacy-note">برای ارسال حساب کاربری، ایمیل یا شماره تماس لازم نیست. فایل تا بررسی مدیر در فضای خصوصی نگهداری می‌شود؛ اطلاعات تماس احتمالی در توضیحات پیش از انتشار پاک‌سازی می‌شوند. اگر بعد از انتشار دربارهٔ حقوق تصویر نگرانی بود، از گزینهٔ «گزارش مشکل» در صفحهٔ همان والپیپر اطلاع دهید.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button-primary request-submit" type="submit" disabled={submitting || categories.isLoading || !categories.data?.length}>
        {submitting ? <span className="spinner" /> : <Send size={16} />}
        {submitting ? "در حال بررسی و ارسال…" : "ارسال برای بررسی"}
      </button>
    </form>}
  </main>;
}
