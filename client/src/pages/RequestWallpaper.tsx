import { useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Copy, Send } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { getResponsiveImageSource } from "@/lib/imagekit";

type DuplicateMatch = {
  id: number;
  title: string;
  gameTitle: string | null;
  thumbnailUrl: string | null;
  resolution: string;
  strength: "strong" | "possible";
};

type DuplicateStatus = "blocked" | "possible" | "unavailable" | null;

const devices = [
  { value: "any", label: "فرقی نمی‌کند" },
  { value: "desktop", label: "دسکتاپ" },
  { value: "mobile", label: "موبایل" },
  { value: "ultrawide", label: "اولتراواید" },
] as const;

const resolutions = [
  "فرقی نمی‌کند", "4K · 3840×2160", "QHD · 2560×1440", "Full HD · 1920×1080", "Ultrawide · 3440×1440", "سفارشی / توضیح در یادداشت",
];

function DuplicateMatchCards({ matches }: { matches: DuplicateMatch[] }) {
  if (!matches.length) return null;
  return <div className="request-duplicate-grid">
    {matches.map(match => <Link key={match.id} className="request-duplicate-card" href={`/wallpapers/${match.id}`}>
      {match.thumbnailUrl
        ? <img src={getResponsiveImageSource(match.thumbnailUrl, [160], { quality: 80, maxWidth: 320 }).src} alt={match.title} loading="lazy" decoding="async" />
        : <span className="request-duplicate-placeholder" aria-hidden="true" />}
      <strong>{match.title}</strong>
    </Link>)}
  </div>;
}

export default function RequestWallpaper() {
  const create = trpc.requests.create.useMutation();
  const [gameTitle, setGameTitle] = useState("");
  const [wantedContent, setWantedContent] = useState("");
  const [targetDevice, setTargetDevice] = useState<(typeof devices)[number]["value"]>("any");
  const [resolution, setResolution] = useState("فرقی نمی‌کند");
  const [details, setDetails] = useState("");
  const [website, setWebsite] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [duplicateStatus, setDuplicateStatus] = useState<DuplicateStatus>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);

  function clearDuplicateResult() {
    setDuplicateStatus(null);
    setDuplicateMatches([]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (website.trim()) { setSubmitted(true); return; }
    try {
      const result = await create.mutateAsync({
        gameTitle: gameTitle.trim(), wantedContent: wantedContent.trim(), targetDevice,
        resolution: resolution === "فرقی نمی‌کند" ? null : resolution,
        details: details.trim() || null, website,
      });
      if (result.duplicateBlocked) {
        setDuplicateStatus("blocked");
        setDuplicateMatches(result.matches);
        return;
      }
      setDuplicateStatus(result.duplicateWarning);
      setDuplicateMatches(result.matches);
      setTrackingCode(typeof result.trackingCode === "string" ? result.trackingCode : "");
      setSubmitted(true);
      setGameTitle(""); setWantedContent(""); setTargetDevice("any");
      setResolution("فرقی نمی‌کند"); setDetails("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت درخواست انجام نشد. کمی بعد دوباره تلاش کنید.");
    }
  }

  return <main className="page-wrap request-page">
    <header className="page-header">
      <span className="eyebrow"><i /> پیشنهادت را با ما در میان بگذار</span>
      <h1>چه والپیپری دنبالش هستی؟</h1>
      <p>بازی، شخصیت یا صحنهٔ دلخواهت را بنویس تا درخواستت برای بررسی در پیکسل والپیپر ثبت شود.</p>
    </header>

    {submitted ? <section className="request-success" role="status">
      <div className="empty-icon"><CheckCircle2 size={25} /></div>
      <h2>درخواستت ثبت شد</h2>
      <p>ممنون که پیشنهاد دادی. درخواست برای بررسی به گنجینه اضافه شد؛ ثبت درخواست به‌معنای تضمین ساخت یا انتشار نیست.</p>
      {duplicateStatus === "possible" && <aside className="request-duplicate-panel is-warning" role="status">
        <strong>چند والپیپر نزدیک پیدا شد؛ درخواستت با این هشدار ثبت شد.</strong>
        <p>اگر تصویر مدنظرت با این موارد فرق دارد، توضیحات دقیق‌تر می‌تواند کمک کند.</p>
        <DuplicateMatchCards matches={duplicateMatches} />
      </aside>}
      {duplicateStatus === "unavailable" && <aside className="request-duplicate-panel is-warning" role="status">
        <strong>بررسی هوشمند موقتاً در دسترس نبود.</strong>
        <p>درخواست ثبت شد و برای بررسی دستی در صف قرار گرفت.</p>
      </aside>}
      {trackingCode && <div className="tracking-code-card"><strong>کد پیگیری را ذخیره کن</strong><p>این کد را نگه دار؛ بعداً بدون حساب کاربری از صفحهٔ پیگیری، وضعیت درخواست را ببین.</p><code dir="ltr">{trackingCode}</code><button className="button-secondary" type="button" onClick={() => { void navigator.clipboard?.writeText(trackingCode).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2200); }).catch(() => setCopied(false)); }}><Copy size={14} />{copied ? "کپی شد" : "کپی کد"}</button></div>}
      <div className="request-success-actions">
        <button className="button-primary" onClick={() => { setSubmitted(false); setTrackingCode(""); clearDuplicateResult(); }}>ثبت یک درخواست دیگر</button>
        <Link className="button-secondary" href="/request/track">پیگیری درخواست <ArrowLeft size={15} /></Link>
        <Link className="button-secondary" href="/">بازگشت به والپیپرها <ArrowLeft size={15} /></Link>
      </div>
    </section> : <form className="request-card" onSubmit={event => void submit(event)}>
      <div className="request-form-grid">
        <div className="form-field">
          <label htmlFor="request-game">نام بازی یا موضوع</label>
          <input id="request-game" value={gameTitle} disabled={create.isPending} onChange={event => { setGameTitle(event.target.value); clearDuplicateResult(); }} maxLength={160} minLength={2} placeholder="مثلاً Elden Ring یا فضای سایبرپانک" required />
        </div>
        <div className="form-field">
          <label htmlFor="request-content">چه چیزی در تصویر باشد؟</label>
          <input id="request-content" value={wantedContent} disabled={create.isPending} onChange={event => { setWantedContent(event.target.value); clearDuplicateResult(); }} maxLength={200} minLength={2} placeholder="مثلاً شخصیت، نقشه یا حال‌وهوای خاص" required />
        </div>
        <div className="form-field">
          <label htmlFor="request-device">دستگاه موردنظر</label>
          <select id="request-device" value={targetDevice} disabled={create.isPending} onChange={event => { setTargetDevice(event.target.value as typeof targetDevice); clearDuplicateResult(); }}>
            {devices.map(device => <option key={device.value} value={device.value}>{device.label}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="request-resolution">رزولوشن دلخواه</label>
          <select id="request-resolution" value={resolution} disabled={create.isPending} onChange={event => { setResolution(event.target.value); clearDuplicateResult(); }}>
            {resolutions.map(item => <option key={item}>{item}</option>)}
          </select>
        </div>
        <div className="form-field request-details-field">
          <label htmlFor="request-details">توضیحات تکمیلی (اختیاری)</label>
          <textarea id="request-details" value={details} disabled={create.isPending} onChange={event => { setDetails(event.target.value); clearDuplicateResult(); }} maxLength={1200} placeholder="رنگ، سبک هنری یا جزئیات دیگری که مدنظر داری..." />
        </div>
      </div>
      <div className="request-honeypot" aria-hidden="true"><label htmlFor="request-website">وب‌سایت</label><input id="request-website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></div>
      {duplicateStatus === "blocked" && <aside className="request-duplicate-panel is-blocked" role="alert">
        <strong>یک والپیپر بسیار مشابه در سایت پیدا شد؛ درخواست ثبت نشد.</strong>
        <p>موارد موجود را بررسی کن یا جزئیات دقیق‌تری برای تصویر متفاوت بنویس.</p>
        <DuplicateMatchCards matches={duplicateMatches} />
      </aside>}
      <p className="request-privacy-note">بدون نیاز به حساب کاربری یا ایمیل؛ اطلاعات تماس درخواست نمی‌شود. پیش از ثبت، متن درخواست با اطلاعات والپیپرهای موجود مقایسه می‌شود. تصویرها و اطلاعات تماس برای بررسی هوشمند ارسال نمی‌شوند.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="button-primary request-submit" type="submit" disabled={create.isPending || duplicateStatus === "blocked"}>
        {create.isPending ? <span className="spinner" /> : <Send size={16} />}
        {create.isPending ? "در حال بررسی و ثبت..." : "ارسال درخواست"}
      </button>
    </form>}
  </main>;
}
