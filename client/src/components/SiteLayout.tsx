import { Link } from "wouter";
import { useFavorites } from "@/lib/wallpaper";
import InstallAppButton from "@/components/InstallAppButton";
import { ClipboardCheck, Heart, Layers3, MessageSquarePlus, Search, Send } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519664055778542/BvOcnZWtyFfXPqMt.png";

export default function SiteLayout({ children }: { children: ReactNode }) {
  const favorites = useFavorites();
  const settings = trpc.siteSettings.public.useQuery();
  const siteSettings = settings.data;
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="site-shell" dir="rtl" style={siteSettings?.accentColor ? { "--brand-accent": siteSettings.accentColor } as CSSProperties : undefined}>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="صفحه اصلی پیکسل والپیپر">
            <img src={siteSettings?.logoUrl || LOGO_URL} alt={`نشان ${siteSettings?.brandName || "پیکسل والپیپر"}`} />
            <span className="brand-copy"><strong>{siteSettings?.brandName || "پیکسل"}</strong><small>{siteSettings?.brandCaption || "والپیپر گیمینگ"}</small></span>
          </Link>
          <a className="telegram-button" href="https://t.me/pixel_wallpaper_chanel" target="_blank" rel="noopener noreferrer" aria-label="ورود به کانال تلگرام پیکسل والپیپر">
            <Send size={16} aria-hidden="true" />
            <span>کانال تلگرام</span>
          </a>
          <button className="mobile-menu-button" aria-label="باز و بسته کردن منو" onClick={() => setMenuOpen(v => !v)}><span /><span /></button>
          <nav className={`main-nav ${menuOpen ? "is-open" : ""}`}>
            <Link href="/" onClick={() => setMenuOpen(false)}><Search size={16} /> کشف والپیپرها</Link>
            <Link href="/collections" onClick={() => setMenuOpen(false)}><Layers3 size={16} /> مجموعه‌ها</Link>
            <Link href="/request" onClick={() => setMenuOpen(false)}><MessageSquarePlus size={16} /> درخواست والپیپر</Link>
            <Link href="/request/track" onClick={() => setMenuOpen(false)}><ClipboardCheck size={16} /> پیگیری درخواست</Link>
            <Link href="/favorites" onClick={() => setMenuOpen(false)}><Heart size={16} /> علاقه‌مندی‌ها <span className="nav-count">{favorites.length.toLocaleString("fa-IR")}</span></Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="footer-inner"><span className="footer-brand"><i /> {siteSettings?.brandName || "پیکسل والپیپر"}</span><span>{siteSettings?.footerTagline || "برای هر فریم، یک دنیای تازه."}</span><InstallAppButton /><span>© {new Date().getFullYear()}</span></div>
      </footer>
    </div>
  );
}
