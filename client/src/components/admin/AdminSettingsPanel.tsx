import { useEffect, useState, type FormEvent } from "react";
import { Check, ImagePlus, Save, Settings2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Settings = { brandName: string; brandCaption: string; footerTagline: string; logoUrl: string; accentColor: string; heroEyebrow: string; heroTitle: string; heroAccentTitle: string; heroSubtitle: string; seoTitle: string; seoDescription: string };
const blank: Settings = { brandName: "", brandCaption: "", footerTagline: "", logoUrl: "", accentColor: "#8b5cf6", heroEyebrow: "", heroTitle: "", heroAccentTitle: "", heroSubtitle: "", seoTitle: "", seoDescription: "" };
const fields: { key: keyof Settings; label: string; multiline?: boolean }[] = [
  { key: "brandName", label: "نام برند" }, { key: "brandCaption", label: "توضیح کوتاه برند" }, { key: "footerTagline", label: "شعار پابرگ" }, { key: "logoUrl", label: "آدرس لوگو (HTTPS یا /manus-storage/)" }, { key: "heroEyebrow", label: "متن کوچک بالای عنوان اصلی" }, { key: "heroTitle", label: "عنوان اصلی" }, { key: "heroAccentTitle", label: "بخش برجستهٔ عنوان" }, { key: "heroSubtitle", label: "زیرعنوان صفحهٔ اصلی", multiline: true }, { key: "seoTitle", label: "عنوان تب مرورگر" }, { key: "seoDescription", label: "توضیح صفحه برای مرورگر", multiline: true },
];
export default function AdminSettingsPanel() {
  const query = trpc.siteSettings.public.useQuery();
  const utils = trpc.useUtils();
  const mutation = trpc.siteSettings.update.useMutation();
  const [form, setForm] = useState<Settings>(blank);
  const [status, setStatus] = useState<{ error?: string; success?: string }>({});
  const [uploading, setUploading] = useState(false);
  useEffect(() => { if (query.data) setForm({ ...blank, ...query.data }); }, [query.data]);
  const change = (key: keyof Settings, value: string) => setForm(current => ({ ...current, [key]: value }));
  const uploadLogo = async (file: File) => {
    setStatus({});
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 4 * 1024 * 1024) { setStatus({ error: "لوگو باید PNG/JPG/WEBP و حداکثر ۴ مگابایت باشد." }); return; }
    setUploading(true);
    try {
      const response = await fetch("/api/admin/upload?purpose=logo", { method: "POST", credentials: "include", headers: { "Content-Type": file.type }, body: file });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "بارگذاری لوگو انجام نشد.");
      change("logoUrl", data.url);
      setStatus({ success: "لوگو بارگذاری شد؛ برای اعمال آن تنظیمات را ذخیره کنید. فایل جدید در Object Storage ذخیره شده است." });
    } catch (error) { setStatus({ error: error instanceof Error ? error.message : "بارگذاری لوگو انجام نشد." }); }
    finally { setUploading(false); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setStatus({});
    if (form.logoUrl && !(form.logoUrl.startsWith("https://") || form.logoUrl.startsWith("/manus-storage/"))) { setStatus({ error: "آدرس لوگو باید HTTPS یا از مسیر /manus-storage/ باشد." }); return; }
    try { await mutation.mutateAsync(form); await utils.siteSettings.public.invalidate(); setStatus({ success: "تنظیمات با موفقیت ذخیره شد." }); }
    catch (error) { setStatus({ error: error instanceof Error ? error.message : "ذخیرهٔ تنظیمات انجام نشد." }); }
  };
  return <section className="admin-panel" dir="rtl"><div className="admin-top"><div><h2><Settings2 size={18} style={{ verticalAlign: "middle", marginLeft: 8 }} />تنظیمات سایت</h2><p>تنظیمات برند، صفحهٔ اصلی و عنوان تب/توضیح مرورگر در پایگاه داده ذخیره می‌شوند.</p></div></div>
    {query.isLoading ? <div className="loading-line">در حال دریافت تنظیمات…</div> : query.error ? <div className="notice-box" role="alert">دریافت تنظیمات ناموفق بود: {query.error.message}</div> : <form className="admin-form" onSubmit={save}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: "0 14px" }}>
        {fields.map(({ key, label, multiline }) => <div className="form-field" key={key}><label htmlFor={`site-${key}`}>{label}</label>{multiline ? <textarea id={`site-${key}`} value={form[key]} onChange={e => change(key, e.target.value)} rows={3} /> : <input id={`site-${key}`} type="text" value={form[key]} onChange={e => change(key, e.target.value)} placeholder={key === "logoUrl" ? "https://… یا /manus-storage/…" : ""} />}</div>)}
        <div className="form-field"><label htmlFor="site-accentColor">رنگ تأکیدی (HEX)</label><div style={{ display: "flex", gap: 8 }}><input id="site-accentColor" value={form.accentColor} onChange={e => change("accentColor", e.target.value)} pattern="^#[0-9a-fA-F]{6}$" aria-label="کد رنگ" /><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : "#8b5cf6"} onChange={e => change("accentColor", e.target.value)} aria-label="انتخاب رنگ" style={{ width: 54, padding: 4 }} /></div></div>
      </div>
      <div className="form-field"><label htmlFor="site-logo-upload">بارگذاری لوگو از دستگاه (PNG/JPG/WEBP، حداکثر ۴ مگابایت)</label><div className="file-drop"><ImagePlus size={20} /><input id="site-logo-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void uploadLogo(file); event.currentTarget.value = ""; }} /></div>{uploading && <small className="form-hint">در حال بارگذاری لوگو…</small>}</div>
      {status.error && <p className="error-text" role="alert">{status.error}</p>}{status.success && <p className="success-text" role="status"><Check size={15} /> {status.success}</p>}
      <div className="form-actions"><button className="button-primary" type="submit" disabled={mutation.isPending}><Save size={15} />{mutation.isPending ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}</button></div>
    </form>}
  </section>;
}
