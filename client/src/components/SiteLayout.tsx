import { Link } from "wouter";
import { useFavorites } from "@/lib/wallpaper";
import InstallAppButton from "@/components/InstallAppButton";
import { Bookmark, ClipboardList, ImagePlus, ImageUp, Moon, Send, Sun } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { getResponsiveImageSource } from "@/lib/imagekit";

const LOGO_URL = "/site-logo.webp";

export default function SiteLayout({ children }: { children: ReactNode }) {
  const favorites = useFavorites();
  const settings = trpc.siteSettings.public.useQuery(undefined, { staleTime: 60_000, refetchOnWindowFocus: false });
  const siteSettings = settings.data;
  const logoImageSource = getResponsiveImageSource(siteSettings?.logoUrl || LOGO_URL, [160, 320], { quality: 80, maxWidth: 320 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return localStorage.getItem("pixel-wallpaper-theme") === "light" ? "light" : "dark"; }
    catch { return "dark"; }
  });
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const siteShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f7f6fb" : "#0a0711");
    try { localStorage.setItem("pixel-wallpaper-theme", theme); } catch { /* storage can be unavailable */ }
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButtonRef.current?.focus(); }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const root = document.getElementById("root");
    const siteShell = siteShellRef.current;
    const ambience = siteShell?.querySelector<HTMLElement>(".scroll-ambience");
    if (!root || !siteShell || !ambience) return;

    const targets = ".page-header, .hero, .section-heading, .discovery-section, .wallpaper-card, .game-hero, .detail-panel, .related-game-cta, .request-card, .request-success, .empty-state";
    const toneTargets = ".hero, .discovery-section, .game-hero, .detail-layout, .request-card, .request-success, .footer";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tones = ["violet", "blue", "cyan", "magenta"];
    let order = 0;
    let toneOrder = 1;
    const activeToneEntries = new Map<Element, IntersectionObserverEntry>();
    const toneObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) activeToneEntries.set(entry.target, entry);
        else activeToneEntries.delete(entry.target);
      });
      const center = window.innerHeight * .48;
      const distance = (entry: IntersectionObserverEntry) => {
        const rect = entry.target.getBoundingClientRect();
        return Math.abs((rect.top + rect.bottom) / 2 - center);
      };
      const active = [...activeToneEntries.values()].sort((a, b) => {
        const ratioDifference = b.intersectionRatio - a.intersectionRatio;
        return Math.abs(ratioDifference) > .05 ? ratioDifference : distance(a) - distance(b);
      })[0];
      if (active?.target instanceof HTMLElement && active.target.dataset.scrollTone) {
        ambience.dataset.tone = active.target.dataset.scrollTone;
      }
    }, { threshold: [0, .15, .35, .6] });
    const revealObserver = reducedMotion ? null : new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in-view");
        revealObserver?.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -28px 0px" });
    const observedToneTargets = new WeakSet<Element>();

    const observeNode = (node: Node) => {
      if (!(node instanceof Element)) return;
      const elements = [...(node.matches(targets) ? [node] : []), ...node.querySelectorAll(targets)];
      elements.forEach(element => {
        if (element.classList.contains("scroll-reveal")) return;
        const htmlElement = element as HTMLElement;
        htmlElement.classList.add("scroll-reveal");
        htmlElement.style.setProperty("--scroll-order", String(order++ % 5));
        revealObserver?.observe(htmlElement);
      });
      const toneElements = [...(node.matches(toneTargets) ? [node] : []), ...node.querySelectorAll(toneTargets)];
      toneElements.forEach(element => {
        if (observedToneTargets.has(element)) return;
        const htmlElement = element as HTMLElement;
        const tone = element.matches(".hero, .game-hero") ? "violet" : element.matches(".footer") ? "magenta" : tones[toneOrder++ % tones.length];
        htmlElement.dataset.scrollTone = tone;
        observedToneTargets.add(element);
        toneObserver.observe(element);
      });
    };

    observeNode(root);
    const contentObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(observeNode);
        record.removedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          const removedElements = [node, ...node.querySelectorAll(`${targets}, ${toneTargets}`)];
          removedElements.forEach(element => {
            revealObserver?.unobserve(element);
            toneObserver.unobserve(element);
            activeToneEntries.delete(element);
            observedToneTargets.delete(element);
            if (!element.classList.contains("is-in-view")) {
              element.classList.remove("scroll-reveal");
              (element as HTMLElement).style.removeProperty("--scroll-order");
            }
          });
        });
      });
    });
    contentObserver.observe(root, { childList: true, subtree: true });

    return () => {
      contentObserver.disconnect();
      revealObserver?.disconnect();
      toneObserver.disconnect();
    };
  }, []);

  return (
    <div ref={siteShellRef} className="site-shell" dir="rtl" style={siteSettings?.accentColor ? { "--brand-accent": siteSettings.accentColor } as CSSProperties : undefined}>
      <div className="scroll-ambience" data-tone="violet" aria-hidden="true">
        <span className="scroll-ambience__layer scroll-ambience__violet" />
        <span className="scroll-ambience__layer scroll-ambience__blue" />
        <span className="scroll-ambience__layer scroll-ambience__cyan" />
        <span className="scroll-ambience__layer scroll-ambience__magenta" />
      </div>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="صفحه اصلی پیکسل والپیپر">
            <img src={logoImageSource.src} srcSet={logoImageSource.srcSet} sizes="44px" alt={`نشان ${siteSettings?.brandName || "پیکسل والپیپر"}`} />
            <span className="brand-copy"><strong>{siteSettings?.brandName || "پیکسل"}</strong><small>{siteSettings?.brandCaption || "والپیپر گیمینگ"}</small></span>
          </Link>
          <a className="telegram-button" href="https://t.me/pixel_wallpaper_chanel" target="_blank" rel="noopener noreferrer" aria-label="ورود به کانال تلگرام پیکسل والپیپر">
            <Send size={16} aria-hidden="true" />
            <span>کانال تلگرام</span>
          </a>
          <button type="button" className="theme-toggle" onClick={() => setTheme(value => value === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تاریک"} aria-pressed={theme === "light"} title={theme === "dark" ? "حالت روشن" : "حالت تاریک"}>
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            <span className="sr-only">{theme === "dark" ? "حالت روشن" : "حالت تاریک"}</span>
          </button>
          <button ref={menuButtonRef} type="button" className="mobile-menu-button" aria-label={menuOpen ? "بستن منو" : "باز کردن منو"} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(value => !value)}><span /><span /></button>
          <nav id="main-navigation" className={`main-nav ${menuOpen ? "is-open" : ""}`}>
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
