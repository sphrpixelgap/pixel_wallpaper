import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { ArrowLeft, ArrowRight, Copy, Download, Flag, Heart, Maximize2, Minus, MonitorDown, Plus, RotateCcw, Send, Share2, Smartphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatBytes, ratioLabel, slugifyGame, toggleFavorite, useFavorites } from "@/lib/wallpaper";
import WallpaperCard from "@/components/WallpaperCard";

type DownloadOption = { id: number | null; resolution: string; width: number | null; height: number | null; targetDevice: string; imageUrl: string; imageMime: string; fileSize: number; downloadCount: number };
const deviceName: Record<string,string> = { desktop: "دسکتاپ", mobile: "موبایل", ultrawide: "اولتراواید" };
const colorName: Record<string,string> = { purple:"بنفش",blue:"آبی",red:"قرمز",green:"سبز",orange:"نارنجی",mono:"تک‌رنگ" };

export default function WallpaperDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  const query = trpc.wallpapers.detail.useQuery({ id }, { enabled: Number.isInteger(id) && id > 0, retry: false });
  const utils = trpc.useUtils();
  const recordView = trpc.wallpapers.recordView.useMutation({ onSuccess: (_result, variables) => {
    void utils.wallpapers.page.invalidate();
    void utils.wallpapers.detail.invalidate({ id: variables.id });
  } });
  const viewRecordedOnPage = useRef<number | null>(null);
  const favorites = useFavorites();
  const wallpaper = query.data;
  const relatedQuery = trpc.wallpapers.list.useQuery({ gameTitle: wallpaper?.gameTitle ?? undefined, category: wallpaper?.gameTitle ? undefined : wallpaper?.category, sort: "popular", limit: 6 }, { enabled: Boolean(wallpaper), staleTime: 30_000 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [shareMessage, setShareMessage] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<"download" | "quality" | "wrong_info" | "duplicate" | "other">("download");
  const [reportDetails, setReportDetails] = useState("");
  const [reportWebsite, setReportWebsite] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const submitIssueReport = trpc.wallpaperReports.submit.useMutation();
  const variants = wallpaper?.variants ?? [];
  const downloads: DownloadOption[] = useMemo(() => wallpaper ? [
    { id: null, resolution: wallpaper.resolution, width: wallpaper.width, height: wallpaper.height, targetDevice: wallpaper.targetDevice, imageUrl: wallpaper.imageUrl, imageMime: wallpaper.imageMime, fileSize: wallpaper.fileSize, downloadCount: wallpaper.downloadCount },
    ...variants.filter(item => item.imageKey !== wallpaper.imageKey).map(item => ({ id: item.id, resolution: item.resolution, width: item.width, height: item.height, targetDevice: item.targetDevice, imageUrl: item.imageUrl, imageMime: item.imageMime, fileSize: item.fileSize, downloadCount: item.downloadCount })),
  ] : [], [wallpaper, variants]);
  const selected = downloads.find(item => item.id === selectedId) ?? downloads[0];
  const navigationItems = wallpaper ? [...(relatedQuery.data ?? []).filter(item => item.id !== wallpaper.id), wallpaper].sort((a, b) => a.id - b.id) : [];
  const currentIndex = navigationItems.findIndex(item => item.id === wallpaper?.id);
  const previousWallpaper = currentIndex > 0 ? navigationItems[currentIndex - 1] : undefined;
  const nextWallpaper = currentIndex >= 0 ? navigationItems[currentIndex + 1] : undefined;
  const changeZoom = (amount: number) => setZoom(current => Math.min(2.5, Math.max(1, Number((current + amount).toFixed(2)))));

  useEffect(() => {
    if (!wallpaper) return;
    const viewedId = wallpaper.id;
    if (viewRecordedOnPage.current === viewedId) return;
    viewRecordedOnPage.current = viewedId;
    const key = `pixelwp:wallpaper-view:${viewedId}`;
    const now = Date.now();
    let canClearSessionMarker = true;
    try {
      const lastView = Number(window.sessionStorage.getItem(key) ?? 0);
      if (Number.isFinite(lastView) && lastView > 0 && now - lastView < 30 * 60_000) return;
      window.sessionStorage.setItem(key, String(now));
    } catch { canClearSessionMarker = false; }
    recordView.mutate({ id: viewedId }, { onError: () => {
      if (!canClearSessionMarker) return;
      try { if (window.sessionStorage.getItem(key) === String(now)) window.sessionStorage.removeItem(key); } catch { /* session storage is optional */ }
    } });
  }, [wallpaper?.id]);

  useEffect(() => { setZoom(1); }, [wallpaper?.id, selectedId]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setZoom(1); return; }
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='radio']")) return;
      if (event.key === "ArrowLeft" && previousWallpaper) { event.preventDefault(); setLocation(`/wallpapers/${previousWallpaper.id}`); return; }
      if (event.key === "ArrowRight" && nextWallpaper) { event.preventDefault(); setLocation(`/wallpapers/${nextWallpaper.id}`); return; }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); changeZoom(0.25); }
      else if (event.key === "-") { event.preventDefault(); changeZoom(-0.25); }
      else if (event.key === "0") { event.preventDefault(); setZoom(1); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextWallpaper?.id, previousWallpaper?.id, setLocation]);

  useEffect(() => { if (wallpaper) document.title = `${wallpaper.title} | پیکسل والپیپر`; return () => { document.title = "پیکسل والپیپر | والپیپر گیمینگ"; }; }, [wallpaper?.id, wallpaper?.title]);
  if (query.isLoading) return <main className="page-wrap"><div className="loading-line"><span className="spinner" /> در حال بارگذاری والپیپر...</div></main>;
  if (query.isError && !query.data) return <main className="page-wrap" dir="rtl"><div className="empty-state" role="alert"><h3>بارگذاری والپیپر انجام نشد</h3><p>خطای ارتباط با گنجینه با نبودن تصویر فرق دارد؛ دوباره تلاش کن.</p><button className="button-secondary" type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>تلاش دوباره</button></div></main>;
  if (!wallpaper || !selected) return <main className="page-wrap"><div className="page-header"><Link href="/" className="eyebrow"><ArrowRight size={15} /> بازگشت به گنجینه</Link></div><div className="empty-state"><h3>این والپیپر در دسترس نیست</h3><p>ممکن است تصویر حذف شده یا نشانی آن اشتباه باشد.</p><Link className="button-primary" href="/">بازگشت به صفحهٔ اصلی</Link></div></main>;

  const tags = (wallpaper.tags ?? "").split(",").map(tag => tag.trim()).filter(Boolean);
  const onShare = async () => {
    const shareData = { title: wallpaper.title, text: `${wallpaper.title} — پیکسل والپیپر`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(window.location.href); setShareMessage("پیوند کپی شد."); }
      else { window.prompt("پیوند والپیپر را کپی کنید:", window.location.href); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage("اشتراک‌گذاری انجام نشد."); }
    window.setTimeout(() => setShareMessage(""), 2600);
  };
  const onSubmitIssueReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setReportError(""); setReportMessage("");
    try {
      await submitIssueReport.mutateAsync({ wallpaperId: wallpaper.id, reason: reportReason, details: reportDetails.trim() || undefined, website: reportWebsite });
      setReportMessage("گزارش شما ثبت شد؛ از کمک به بهترشدن گنجینه سپاسگزاریم."); setReportDetails(""); setReportWebsite(""); setReportOpen(false);
    } catch (cause) { setReportError(cause instanceof Error ? cause.message : "ثبت گزارش انجام نشد."); }
  };
  return <main className="page-wrap">
    <div className="page-header"><Link href="/" className="eyebrow"><ArrowRight size={15} /> بازگشت به والپیپرها</Link></div>
    <section className="detail-layout">
      <div className="detail-visual">
        <div className="detail-preview-toolbar">
          <div className="detail-zoom-controls" role="group" aria-label="کنترل بزرگ‌نمایی تصویر">
            <button type="button" onClick={() => changeZoom(-0.25)} disabled={zoom <= 1} aria-label="کوچک‌نمایی"><Minus size={15} /></button>
            <output aria-live="polite">{Math.round(zoom * 100).toLocaleString("fa-IR")}٪</output>
            <button type="button" onClick={() => changeZoom(0.25)} disabled={zoom >= 2.5} aria-label="بزرگ‌نمایی"><Plus size={15} /></button>
            <button type="button" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="بازگشت به اندازهٔ جاگرفته"><RotateCcw size={14} /></button>
          </div>
          <nav className="detail-image-navigation" aria-label="تصویرهای مرتبط">
            <button type="button" disabled={!previousWallpaper} aria-label="والپیپر مرتبط قبلی" onClick={() => previousWallpaper && setLocation(`/wallpapers/${previousWallpaper.id}`)}><ArrowRight size={15} /> قبلی</button>
            <button type="button" disabled={!nextWallpaper} aria-label="والپیپر مرتبط بعدی" onClick={() => nextWallpaper && setLocation(`/wallpapers/${nextWallpaper.id}`)}>بعدی <ArrowLeft size={15} /></button>
          </nav>
        </div>
        <div className="detail-image-viewport" style={{ aspectRatio: selected.width && selected.height ? `${selected.width} / ${selected.height}` : "16 / 9" }}>
          <img className="detail-image" src={selected.imageUrl} alt={wallpaper.title} fetchPriority="high" decoding="async" style={{ transform: `scale(${zoom})` }} />
        </div>
        <div className="detail-visual-caption"><span><Maximize2 size={13}/>{ratioLabel(selected.width,selected.height)}</span><span><Download size={13}/>{formatBytes(selected.fileSize)}</span></div>
        <p className="detail-keyboard-hint">میان‌برها: +/− بزرگ‌نمایی، ۰ بازنشانی، ←/→ تصویر مرتبط، Esc جاگرفتن تصویر</p>
      </div>
      <div className="detail-panel">
        <span className="category-label">{wallpaper.category}{wallpaper.mood !== "سایر" ? ` · ${wallpaper.mood}` : ""}</span>
        <h1>{wallpaper.title}</h1>
        {wallpaper.gameTitle && <Link className="detail-game-link" href={`/games/${slugifyGame(wallpaper.gameTitle)}`}><MonitorDown size={14}/> مجموعهٔ {wallpaper.gameTitle}</Link>}
        {wallpaper.description && <p>{wallpaper.description}</p>}
        <div className="detail-specs">
          <div><span>کیفیت انتخاب‌شده</span><strong>{selected.resolution}</strong></div>
          <div><span>ابعاد واقعی</span><strong>{selected.width && selected.height ? `${selected.width} × ${selected.height}` : "ثبت نشده"}</strong></div>
          <div><span>نسبت تصویر</span><strong>{ratioLabel(selected.width,selected.height)}</strong></div>
          <div><span>دستگاه</span><strong>{deviceName[selected.targetDevice] ?? "سایر"}</strong></div>
          <div><span>رنگ غالب</span><strong>{colorName[wallpaper.dominantColor] ?? "سایر"}</strong></div>
          <div><span>حجم فایل</span><strong>{formatBytes(selected.fileSize)}</strong></div>
          <div><span>تعداد دانلود</span><strong>{wallpaper.downloadCount.toLocaleString("fa-IR")}</strong></div>
          <div><span>تعداد بازدید</span><strong>{wallpaper.viewCount.toLocaleString("fa-IR")}</strong></div>
        </div>
        {downloads.length > 1 && <fieldset className="download-variants"><legend>نسخهٔ مناسب را انتخاب کن</legend><div className="variant-options" role="radiogroup" aria-label="انتخاب نسخهٔ دانلودی">{downloads.map(item => <button type="button" role="radio" aria-checked={selected.id === item.id} aria-label={`${item.resolution}، ${item.width && item.height ? `${item.width} در ${item.height}` : "ابعاد نامشخص"}، ${deviceName[item.targetDevice] ?? "سایر"}، ${formatBytes(item.fileSize)}`} key={item.id ?? "original"} className={`variant-option ${selected.id === item.id ? "selected" : ""}`} onClick={() => setSelectedId(item.id)}><b>{item.resolution}</b><small>{item.width && item.height ? `${item.width} × ${item.height} · ${ratioLabel(item.width, item.height)} · ` : ""}{deviceName[item.targetDevice] ?? "سایر"} · {formatBytes(item.fileSize)}</small></button>)}</div></fieldset>}
        {tags.length > 0 && <div className="detail-tags">{tags.map(tag => <Link key={tag} href={`/?q=${encodeURIComponent(tag)}`} className="detail-tag">#{tag}</Link>)}</div>}
        <div className="detail-actions">
          <a className="button-primary" href={`/api/wallpapers/${wallpaper.id}/download${selected.id === null ? "" : `?variantId=${selected.id}`}`}><Download size={16} /> دانلود {selected.resolution}</a>
          <button className="favorite-detail" aria-pressed={favorites.includes(wallpaper.id)} onClick={() => toggleFavorite(wallpaper.id)}><Heart size={16} fill={favorites.includes(wallpaper.id) ? "currentColor" : "none"} />{favorites.includes(wallpaper.id) ? "ذخیره‌شده" : "علاقه‌مندی"}</button>
          <button className="favorite-detail" onClick={() => void onShare()}><Share2 size={16} /> اشتراک‌گذاری</button>
          <button className="favorite-detail" type="button" aria-expanded={reportOpen} onClick={() => { setReportOpen(value => !value); setReportError(""); }}><Flag size={15} /> گزارش مشکل</button>
        </div>
        {shareMessage && <p className="share-status" role="status"><Copy size={13}/>{shareMessage}</p>}
        {reportMessage && <p className="share-status" role="status">{reportMessage}</p>}
        {reportOpen && <form className="wallpaper-report-form" onSubmit={event => void onSubmitIssueReport(event)}>
          <h3>گزارش مشکل این والپیپر</h3><p>ورود لازم نیست. نشانی شبکه ذخیره نمی‌شود و فقط hash محافظت‌شده برای محدودکردن هرزنامه استفاده می‌شود.</p>
          <label>دلیل گزارش<select value={reportReason} onChange={event => setReportReason(event.target.value as typeof reportReason)}><option value="download">مشکل دانلود</option><option value="quality">کیفیت تصویر</option><option value="wrong_info">اطلاعات نادرست</option><option value="duplicate">تصویر تکراری</option><option value="other">سایر</option></select></label>
          <label>توضیح (اختیاری)<textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} maxLength={800} rows={3} placeholder="اگر لازم است، کوتاه توضیح بده..." /></label>
          <input className="wallpaper-report-honeypot" type="text" name="website" value={reportWebsite} onChange={event => setReportWebsite(event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" />
          {reportError && <p className="error-text" role="alert">{reportError}</p>}
          <div className="form-actions"><button className="button-primary" type="submit" disabled={submitIssueReport.isPending}>{submitIssueReport.isPending ? "در حال ثبت..." : <><Send size={14} /> ارسال گزارش</>}</button><button className="button-secondary" type="button" onClick={() => setReportOpen(false)}>انصراف</button></div>
        </form>}
        <p className="detail-footnote"><Smartphone size={13} /> نسخهٔ اصلی با وضوح بارگذاری‌شده نگهداری می‌شود.</p>
      </div>
    </section>
    {wallpaper.gameTitle && <section className="related-game-cta"><div><span className="section-kicker">مجموعهٔ بازی</span><h2>از دنیای {wallpaper.gameTitle}</h2></div><Link className="button-secondary" href={`/games/${slugifyGame(wallpaper.gameTitle)}`}>دیدن همهٔ والپیپرها <ArrowLeft size={14}/></Link></section>}
    {relatedQuery.data?.filter(item => item.id !== wallpaper.id).length ? <section className="related-wallpapers"><div className="section-heading"><div><span className="section-kicker">شاید این‌ها را هم دوست داشته باشی</span><h2>تصویرهای مرتبط</h2><p>{wallpaper.gameTitle ? `از بازی ${wallpaper.gameTitle}` : `از دستهٔ ${wallpaper.category}`}</p></div></div><div className="wallpaper-grid related-grid">{relatedQuery.data.filter(item => item.id !== wallpaper.id).slice(0, 4).map(item => <WallpaperCard key={item.id} wallpaper={item} compact />)}</div></section> : null}
  </main>;
}
