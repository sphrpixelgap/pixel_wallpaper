import { Link } from "wouter";
import { useFavorites } from "@/lib/wallpaper";
import InstallAppButton from "@/components/InstallAppButton";
import { Bookmark, ClipboardList, Compass, ImagePlus, ImageUp, Images, Send } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519664055778542/BvOcnZWtyFfXPqMt.png";

export default function SiteLayout({ children }: { children: ReactNode }) {
  const favorites = useFavorites();
  const settings = trpc.siteSettings.public.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const siteSettings = settings.data;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.getElementById("root");
    if (!root) return;

    const targets = ".page-header, .hero, .section-heading, .discovery-section, .wallpaper-card, .game-hero, .detail-panel, .related-game-cta, .request-card, .request-success, .empty-state";
    let order = 0;
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in-view");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -28px 0px" });

    const observeNode = (node: Node) => {
      if (!(node instanceof Element)) return;
      const elements = [...(node.matches(targets) ? [node] : []), ...node.querySelectorAll(targets)];
      elements.forEach(element => {
        if (element.classList.contains("scroll-reveal")) return;
        const htmlElement = element as HTMLElement;
        htmlElement.classList.add("scroll-reveal");
        htmlElement.style.setProperty("--scroll-order", String(order++ % 5));
        revealObserver.observe(htmlElement);
      });
    };

    observeNode(root);
    const contentObserver = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(observeNode));
    });
    contentObserver.observe(root, { childList: true, subtree: true });

    return () => {
      contentObserver.disconnect();
      revealObserver.disconnect();
    };
  }, []);

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
          <button ref={menuButtonRef} type="button" className="mobile-menu-button" aria-label={menuOpen ? "بستن منو" : "باز کردن منو"} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(value => !value)}><span /><span /></button>
          <nav id="main-navigation" className={`main-nav ${menuOpen ? "is-open" : ""}`}>
            <Link href="/" onClick={() => setMenuOpen(false)}><Compass size={18} strokeWidth={1.9} aria-hidden="true" /> کشف والپیپرها</Link>
            <Link href="/collections" onClick={() => setMenuOpen(false)}><Images size={18} strokeWidth={1.9} aria-hidden="true" /> مجموعه‌ها</Link>
            <Link href="/request" onClick={() => setMenuOpen(false)}><ImagePlus size={18} strokeWidth={1.9} aria-hidden="true" /> درخواست والپیپر</Link>
            <Link href="/submit-wallpaper" onClick={() => setMenuOpen(false)}><ImageUp size={18} strokeWidth={1.9} aria-hidden="true" /> ارسال والپیپر</Link>
            <Link href="/request/track" onClick={() => setMenuOpen(false)}><ClipboardList size={18} strokeWidth={1.9} aria-hidden="true" /> پیگیری درخواست</Link>
            <Link href="/favorites" onClick={() => setMenuOpen(false)}><Bookmark size={18} strokeWidth={1.9} aria-hidden="true" /> علاقه‌مندی‌ها <span className="nav-count">{favorites.length.toLocaleString("fa-IR")}</span></Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-main">
            <div className="footer-identity">
              <Link href="/" className="footer-brand" aria-label="صفحه اصلی پیکسل والپیپر"><i /> {siteSettings?.brandName || "پیکسل والپیپر"}</Link>
              <p>{siteSettings?.footerTagline || "برای هر فریم، یک دنیای تازه."}</p>
            </div>
            <nav className="footer-links" aria-label="پیوندهای مفید">
              <Link href="/">کشف والپیپرها</Link>
              <Link href="/collections">مجموعه‌ها</Link>
              <Link href="/request">درخواست والپیپر</Link>
              <Link href="/submit-wallpaper">ارسال والپیپر</Link>
              <Link href="/request/track">پیگیری درخواست</Link>
              <Link href="/favorites">علاقه‌مندی‌ها</Link>
            </nav>
            <div className="footer-social">
              <strong>شبکه اجتماعی</strong>
              <a href="https://t.me/pixel_wallpaper_chanel" target="_blank" rel="noopener noreferrer"><Send size={15} aria-hidden="true" /> کانال تلگرام</a>
            </div>
          </div>
          <div className="footer-bottom"><InstallAppButton /><span>© {new Date().getFullYear()} {siteSettings?.brandName || "پیکسل والپیپر"}</span></div>
        </div>
      </footer>
    </div>
  );
}
