import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { ArrowRight, Gamepad2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { devices, slugifyGame } from "@/lib/wallpaper";
import WallpaperCard from "@/components/WallpaperCard";

export default function Games() {
  const { slug = "" } = useParams<{ slug: string }>();
  const games = trpc.games.list.useQuery();
  const matched = games.data?.find(item => item.gameTitle && slugifyGame(item.gameTitle) === slug);
  const [q, setQ] = useState("");
  const [device, setDevice] = useState("");
  const wallpapers = trpc.wallpapers.list.useQuery({
    gameTitle: matched?.gameTitle ?? "__not-found__", q: q || undefined,
    targetDevice: device ? device as "desktop" | "mobile" | "ultrawide" : undefined,
  }, { enabled: Boolean(matched) });
  const title = matched?.gameTitle ?? "";
  useEffect(() => {
    if (title) document.title = `${title} | والپیپرهای گیمینگ پیکسل`;
    return () => { document.title = "پیکسل والپیپر | والپیپر گیمینگ"; };
  }, [title]);

  if (games.isLoading) return <main className="page-wrap"><div className="loading-line"><span className="spinner" /> در حال پیدا کردن بازی...</div></main>;
  if (!matched) return <main className="page-wrap"><div className="page-header"><Link href="/" className="eyebrow"><ArrowRight size={15} /> بازگشت</Link></div><div className="empty-state"><div className="empty-icon"><Gamepad2 /></div><h3>این بازی هنوز در گنجینه نیست</h3><p>نام بازی را در جست‌وجوی والپیپرها امتحان کن.</p><Link className="button-primary" href="/">رفتن به گنجینه</Link></div></main>;

  return <main className="page-wrap">
    <header className="game-hero"><span className="eyebrow"><Gamepad2 size={15} /> GAME COLLECTION</span><h1>والپیپرهای <span>{title}</span></h1><p>{matched.wallpaperCount.toLocaleString("fa-IR")} تصویر از دنیای {title}</p></header>
    <div className="filter-row"><label className="search-field"><Search size={17} /><input aria-label="جست‌وجو در والپیپرهای این بازی" value={q} onChange={event => setQ(event.target.value)} placeholder="جست‌وجو در این بازی..." /></label><select className="filter-select" value={device} onChange={event => setDevice(event.target.value)}><option value="">همهٔ دستگاه‌ها</option>{devices.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></div>
    {wallpapers.isLoading ? <div className="loading-line"><span className="spinner" /> در حال بارگذاری...</div> : wallpapers.data?.length ? <div className="wallpaper-grid">{wallpapers.data.map(wallpaper => <WallpaperCard key={wallpaper.id} wallpaper={wallpaper} />)}</div> : <div className="empty-state"><h3>والپیپری پیدا نشد</h3><p>فیلتر دستگاه یا عبارت جست‌وجو را تغییر بده.</p></div>}
  </main>;
}
