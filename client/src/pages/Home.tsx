import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowUpLeft, ChevronLeft, ChevronRight, Flame, Gamepad2, Image as ImageIcon, Palette, Search, Shuffle, Sparkles, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { categories as fallbackCategories, colors, devices, moods, resolutions, slugifyGame } from "@/lib/wallpaper";
import WallpaperCard from "@/components/WallpaperCard";
import InstallAppButton from "@/components/InstallAppButton";

const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519664055778542/BvOcnZWtyFfXPqMt.png";
const PAGE_SIZE = 24;
const FEATURED_PAGE_SIZE = 4;
const optionId = (index: number) => `wallpaper-search-option-${index}`;

type FeaturedKey = "popular" | "action" | "adventure" | "cyberpunk";
type CollectionData<T> = { items: T[]; total: number } | undefined;

function collectionPage<T>(data: CollectionData<T>, requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / FEATURED_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  return { items: data?.items ?? [], page, totalPages };
}

function CollectionPager({ section, page, totalPages, isFetching, onChange }: {
  section: string;
  page: number;
  totalPages: number;
  isFetching: boolean;
  onChange: (direction: -1 | 1) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="featured-pagination" aria-label={`صفحه‌بندی ${section}`}>
      <button type="button" className="button-secondary" aria-label={`صفحهٔ قبلی ${section}`} disabled={isFetching || page <= 1} onClick={() => onChange(-1)}><ChevronRight size={15} /> قبلی</button>
      <span aria-live="polite">صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span>
      <button type="button" className="button-secondary" aria-label={`صفحهٔ بعدی ${section}`} disabled={isFetching || page >= totalPages} onClick={() => onChange(1)}>بعدی <ChevronLeft size={15} /></button>
    </nav>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [category, setCategory] = useState("");
  const [resolution, setResolution] = useState("");
  const [device, setDevice] = useState("");
  const [mood, setMood] = useState("");
  const [color, setColor] = useState("");
  const [sort, setSort] = useState<"newest" | "popular" | "resolution" | "aspect" | "size">("newest");
  const [page, setPage] = useState(1);
  const [featuredPages, setFeaturedPages] = useState<Record<FeaturedKey, number>>({ popular: 1, action: 1, adventure: 1, cyberpunk: 1 });
  const settings = trpc.siteSettings.public.useQuery();
  const taxonomyCategories = trpc.taxonomy.categories.useQuery();
  const siteSettings = settings.data;
  const displayCategories = taxonomyCategories.data ?? fallbackCategories;

  useEffect(() => {
    if (siteSettings?.seoTitle) document.title = siteSettings.seoTitle;
    if (siteSettings?.seoDescription) {
      let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!description) { description = document.createElement("meta"); description.name = "description"; document.head.appendChild(description); }
      description.content = siteSettings.seoDescription;
    }
  }, [siteSettings?.seoTitle, siteSettings?.seoDescription]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { setActiveSuggestion(-1); }, [debouncedSearch]);
  const filters = useMemo(() => ({
    q: debouncedSearch || undefined, category: category || undefined, resolution: resolution || undefined,
    targetDevice: device ? device as "desktop" | "mobile" | "ultrawide" : undefined,
    mood: mood || undefined,
    dominantColor: color ? color as "purple" | "blue" | "red" | "green" | "orange" | "mono" : undefined,
    sort,
  }), [debouncedSearch, category, resolution, device, mood, color, sort]);
  const hasFilters = Boolean(search || category || resolution || device || mood || color || sort !== "newest");
  useEffect(() => { setPage(1); }, [filters]);

  const query = trpc.wallpapers.page.useQuery({ ...filters, page });
  const popular = trpc.wallpapers.page.useQuery({ sort: "popular", page: featuredPages.popular, pageSize: FEATURED_PAGE_SIZE }, { enabled: !hasFilters, placeholderData: previous => previous });
  const actionCollection = trpc.wallpapers.page.useQuery({ category: "اکشن", sort: "popular", page: featuredPages.action, pageSize: FEATURED_PAGE_SIZE }, { enabled: !hasFilters, placeholderData: previous => previous });
  const adventureCollection = trpc.wallpapers.page.useQuery({ category: "ماجراجویی", sort: "popular", page: featuredPages.adventure, pageSize: FEATURED_PAGE_SIZE }, { enabled: !hasFilters, placeholderData: previous => previous });
  const cyberpunkCollection = trpc.wallpapers.page.useQuery({ category: "سایبرپانک", sort: "popular", page: featuredPages.cyberpunk, pageSize: FEATURED_PAGE_SIZE }, { enabled: !hasFilters, placeholderData: previous => previous });
  const dailyPick = trpc.discover.daily.useQuery(undefined, { staleTime: 60_000 });
  const randomPick = trpc.discover.random.useQuery(undefined, { enabled: false, retry: false });
  const games = trpc.games.list.useQuery();
  const suggestions = trpc.wallpapers.suggestions.useQuery({ q: debouncedSearch }, { enabled: debouncedSearch.length >= 2, staleTime: 10_000 });
  const wallpapers = query.data?.items ?? [];
  const suggestionItems = suggestions.data ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const popularPage = collectionPage(popular.data, featuredPages.popular);
  const actionPage = collectionPage(actionCollection.data, featuredPages.action);
  const adventurePage = collectionPage(adventureCollection.data, featuredPages.adventure);
  const cyberpunkPage = collectionPage(cyberpunkCollection.data, featuredPages.cyberpunk);
  const turnFeaturedPage = (key: FeaturedKey, direction: -1 | 1, pages: number) => setFeaturedPages(current => {
    const currentPage = Math.min(current[key], pages);
    return { ...current, [key]: Math.max(1, Math.min(pages, currentPage + direction)) };
  });
  useEffect(() => {
    const limits: Record<FeaturedKey, number> = {
      popular: popular.data?.total ?? 0, action: actionCollection.data?.total ?? 0,
      adventure: adventureCollection.data?.total ?? 0, cyberpunk: cyberpunkCollection.data?.total ?? 0,
    };
    setFeaturedPages(current => {
      let changed = false;
      const next = { ...current };
      (Object.keys(limits) as FeaturedKey[]).forEach(key => {
        const lastPage = Math.max(1, Math.ceil(limits[key] / FEATURED_PAGE_SIZE));
        if (next[key] > lastPage) { next[key] = lastPage; changed = true; }
      });
      return changed ? next : current;
    });
  }, [popular.data?.total, actionCollection.data?.total, adventureCollection.data?.total, cyberpunkCollection.data?.total]);
  const clearFilters = () => { setSearch(""); setCategory(""); setResolution(""); setDevice(""); setMood(""); setColor(""); setSort("newest"); setPage(1); };
  const colorsLabel = colors.find(item => item.value === color)?.label;
  const goSuggestion = (item: { label: string; type: "wallpaper" | "game" | "tag" }) => {
    setShowSuggestions(false); setActiveSuggestion(-1);
    if (item.type === "game") setLocation(`/games/${slugifyGame(item.label)}`);
    else setSearch(item.label);
  };
  const shownFrom = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const shownTo = Math.min(page * PAGE_SIZE, total);

  return (
    <main className="page-wrap">
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow"><i /> {siteSettings?.heroEyebrow || "دنیای تصویرهای گیمینگ"}</span>
          <h1>{siteSettings?.heroTitle || "بازی‌ها را"}<br /><span>{siteSettings?.heroAccentTitle || "به صفحه‌ات بیاور."}</span></h1>
          <p>{siteSettings?.heroSubtitle || "والپیپرهای گیمینگ باکیفیت، برای دسکتاپی که حال‌وهوای بازی محبوبت را زندگی می‌کند. کشف کن، ذخیره کن و با وضوح دلخواه دانلود کن."}</p>
          <div className="hero-actions">
            <a className="button-primary" href="#catalog"><Gamepad2 size={17} /> گشت‌وگذار در گنجینه <ArrowLeft size={15} /></a>
            <Link className="button-secondary" href="/favorites"><span>علاقه‌مندی‌ها</span><ArrowUpLeft size={15} /></Link>
            <InstallAppButton />
          </div>
        </div>
        <div className="hero-mark" aria-hidden="true"><img src={siteSettings?.logoUrl || LOGO_URL} alt="لوگوی پیکسل والپیپر" /></div>
      </section>

      <section className="discovery-picks" aria-label="پیشنهادهای روزانه و تصادفی">
        <div className="daily-pick-card">
          <div className="daily-pick-copy"><span className="section-kicker"><Star size={13} /> انتخاب امروز · {dailyPick.data?.day ?? ""}</span><h2>یک فریم برای امروز</h2><p>پیشنهاد روزانه؛ هر روز با یک تصویر تازه از گنجینه.</p>{dailyPick.data?.wallpaper && <Link className="button-secondary" href={`/wallpapers/${dailyPick.data.wallpaper.id}`}>دیدن انتخاب امروز <ArrowLeft size={14} /></Link>}</div>
          {dailyPick.data?.wallpaper ? <div className="daily-pick-art"><WallpaperCard wallpaper={dailyPick.data.wallpaper} compact showActions={false} priority /></div> : <div className="daily-pick-art daily-pick-placeholder"><Sparkles size={28} />{dailyPick.isSuccess && <span>گنجینه هنوز تصویری برای پیشنهاد روزانه ندارد.</span>}</div>}
        </div>
        <div className="random-pick-card">
          <div><span className="section-kicker">کشف شانسی</span><h2>بگذار گنجینه غافلگیرت کند</h2><p>انتخاب تصادفی از میان همهٔ والپیپرهای فعال.</p></div>
          <button className="button-primary" type="button" disabled={randomPick.isFetching} onClick={() => void randomPick.refetch()}>{randomPick.isFetching ? <span className="spinner" /> : <Shuffle size={16} />}{randomPick.isFetching ? "در حال انتخاب..." : "یک والپیپر تصادفی"}</button>
          {randomPick.data ? <Link className="random-result" href={`/wallpapers/${randomPick.data.id}`}>{randomPick.data.title} <ArrowUpLeft size={14} /></Link> : randomPick.isSuccess && <p className="random-empty" role="status">در حال حاضر والپیپر فعالی برای انتخاب تصادفی وجود ندارد.</p>}
        </div>
      </section>

      {games.data?.length ? <section className="discovery-section">
        <div className="section-heading"><div><span className="section-kicker">انتخاب دنیای بازی</span><h2>بازی‌ها</h2><p>مستقیم وارد دنیای بازی دلخواهت شو</p></div><Gamepad2 size={20} color="#bd92ff" /></div>
        <div className="game-strip">{games.data.map(game => game.gameTitle && <Link key={game.gameTitle} className="game-chip" href={`/games/${slugifyGame(game.gameTitle)}`}><span className="game-chip-icon"><Gamepad2 size={17} /></span><span><b>{game.gameTitle}</b><small>{game.wallpaperCount.toLocaleString("fa-IR")} تصویر</small></span><ArrowUpLeft size={15} /></Link>)}</div>
      </section> : null}

      {!hasFilters && (popular.data?.total || actionCollection.data?.total || adventureCollection.data?.total || cyberpunkCollection.data?.total) ? <div className="featured-sections">
        {popular.data?.total ? <section className="discovery-section"><div className="section-heading"><div><span className="section-kicker">بر اساس بازدید کاربران</span><h2>محبوب‌ترین‌ها</h2></div><Flame size={19} color="#ff9b7b" /></div><div className="wallpaper-grid featured-grid" aria-busy={popular.isFetching}>{popularPage.items.map(item => <WallpaperCard key={item.id} wallpaper={item} compact presentation="gallery" showActions={false} />)}</div><CollectionPager section="محبوب‌ترین‌ها" page={popularPage.page} totalPages={popularPage.totalPages} isFetching={popular.isFetching} onChange={direction => turnFeaturedPage("popular", direction, popularPage.totalPages)} /></section> : null}
        {actionCollection.data?.total ? <section className="discovery-section"><div className="section-heading"><div><span className="section-kicker">مجموعهٔ منتخب</span><h2>ضرب‌آهنگ اکشن</h2></div><Gamepad2 size={19} color="#ff9b7b" /></div><div className="wallpaper-grid featured-grid" aria-busy={actionCollection.isFetching}>{actionPage.items.map(item => <WallpaperCard key={item.id} wallpaper={item} compact presentation="gallery" showActions={false} />)}</div><CollectionPager section="اکشن" page={actionPage.page} totalPages={actionPage.totalPages} isFetching={actionCollection.isFetching} onChange={direction => turnFeaturedPage("action", direction, actionPage.totalPages)} /></section> : null}
        {adventureCollection.data?.total ? <section className="discovery-section"><div className="section-heading"><div><span className="section-kicker">مجموعهٔ منتخب</span><h2>سفر به دنیاهای ماجراجویی</h2></div><Sparkles size={19} color="#bd92ff" /></div><div className="wallpaper-grid featured-grid" aria-busy={adventureCollection.isFetching}>{adventurePage.items.map(item => <WallpaperCard key={item.id} wallpaper={item} compact presentation="gallery" showActions={false} />)}</div><CollectionPager section="ماجراجویی" page={adventurePage.page} totalPages={adventurePage.totalPages} isFetching={adventureCollection.isFetching} onChange={direction => turnFeaturedPage("adventure", direction, adventurePage.totalPages)} /></section> : null}
        {cyberpunkCollection.data?.total ? <section className="discovery-section"><div className="section-heading"><div><span className="section-kicker">مجموعهٔ منتخب</span><h2>نورهای سایبرپانک</h2></div><Palette size={19} color="#74d4ff" /></div><div className="wallpaper-grid featured-grid" aria-busy={cyberpunkCollection.isFetching}>{cyberpunkPage.items.map(item => <WallpaperCard key={item.id} wallpaper={item} compact presentation="gallery" showActions={false} />)}</div><CollectionPager section="سایبرپانک" page={cyberpunkPage.page} totalPages={cyberpunkPage.totalPages} isFetching={cyberpunkCollection.isFetching} onChange={direction => turnFeaturedPage("cyberpunk", direction, cyberpunkPage.totalPages)} /></section> : null}
      </div> : null}

      <section id="catalog" className="catalog-section">
        <div className="section-heading"><div><span className="section-kicker">گنجینهٔ تصویرهای بازی</span><h2 id="catalog-heading" tabIndex={-1}>گنجینهٔ گیمینگ</h2><p>{total.toLocaleString("fa-IR")} والپیپر در {totalPages.toLocaleString("fa-IR")} صفحه</p></div><span className="eyebrow"><Sparkles size={14} /> حال‌وهوای بازی، روی نمایشگر تو</span></div>
        <div className="category-strip" aria-label="فیلتر دسته‌بندی">
          <button className={`category-chip ${!category ? "selected" : ""}`} aria-pressed={!category} onClick={() => setCategory("")}>همهٔ بازی‌ها</button>
          {displayCategories.map(item => <button key={item} className={`category-chip ${category === item ? "selected" : ""}`} aria-pressed={category === item} onClick={() => setCategory(category === item ? "" : item)}>{item}</button>)}
        </div>
        <div className="filter-row filter-row-rich">
          <div className="search-suggest-wrap">
            <label className="search-field"><Search size={17} /><input value={search} role="combobox" aria-label="جست‌وجوی والپیپر و بازی" aria-autocomplete="list" aria-expanded={showSuggestions && Boolean(suggestionItems.length)} aria-controls="wallpaper-search-options" aria-activedescendant={activeSuggestion >= 0 ? optionId(activeSuggestion) : undefined} onFocus={() => setShowSuggestions(true)} onBlur={() => window.setTimeout(() => setShowSuggestions(false), 160)} onChange={event => setSearch(event.target.value)} onKeyDown={event => {
              if (event.key === "Escape") { setShowSuggestions(false); setActiveSuggestion(-1); }
              if (event.key === "ArrowDown" && suggestionItems.length) { event.preventDefault(); setShowSuggestions(true); setActiveSuggestion(current => Math.min(current + 1, suggestionItems.length - 1)); }
              if (event.key === "ArrowUp" && suggestionItems.length) { event.preventDefault(); setActiveSuggestion(current => Math.max(current - 1, 0)); }
              if (event.key === "Enter" && suggestionItems.length) { event.preventDefault(); goSuggestion(suggestionItems[activeSuggestion] ?? suggestionItems[0]); }
            }} placeholder="نام بازی، والپیپر یا برچسب..." />{search && <button className="clear-search" type="button" onMouseDown={event => event.preventDefault()} onClick={() => setSearch("")} aria-label="پاک‌کردن جست‌وجو"><X size={15} /></button>}</label>
            {showSuggestions && debouncedSearch.length >= 2 && suggestionItems.length ? <div className="suggestion-list" id="wallpaper-search-options" role="listbox" aria-label="پیشنهادهای جست‌وجو">{suggestionItems.map((item, index) => <button key={`${item.type}-${item.label}-${index}`} id={optionId(index)} role="option" aria-selected={activeSuggestion === index} className={`suggestion-item ${activeSuggestion === index ? "is-active" : ""}`} onMouseDown={event => event.preventDefault()} onClick={() => goSuggestion(item)}><Search size={14} /><span>{item.label}</span><small>{item.type === "game" ? "بازی" : item.type === "tag" ? "برچسب" : "والپیپر"}</small></button>)}</div> : null}
          </div>
          <select className="filter-select" value={device} onChange={event => setDevice(event.target.value)} aria-label="نوع دستگاه"><option value="">همهٔ دستگاه‌ها</option>{devices.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="filter-select" value={resolution} onChange={event => setResolution(event.target.value)} aria-label="فیلتر رزولوشن"><option value="">همهٔ رزولوشن‌ها</option>{resolutions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="filter-select" value={mood} onChange={event => setMood(event.target.value)} aria-label="حال‌وهوای تصویر"><option value="">همهٔ حال‌وهواها</option>{moods.map(item => <option key={item} value={item}>{item}</option>)}</select>
          <select className="filter-select" value={color} onChange={event => setColor(event.target.value)} aria-label="رنگ غالب"><option value="">همهٔ رنگ‌ها</option>{colors.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select className="filter-select" value={sort} onChange={event => setSort(event.target.value as typeof sort)} aria-label="مرتب‌سازی کاتالوگ"><option value="newest">تازه‌ترین</option><option value="popular">محبوب‌ترین</option><option value="resolution">بیشترین وضوح فایل اصلی</option><option value="aspect">نسبت تصویر عریض‌تر</option><option value="size">حجم فایل اصلی</option></select>
        </div>
        {hasFilters && <div className="active-filters"><span><Palette size={13} /> فیلترهای فعال:</span>{category && <button onClick={() => setCategory("")}>{category} <X size={12} /></button>}{device && <button onClick={() => setDevice("")}>{devices.find(item => item.value === device)?.label} <X size={12} /></button>}{resolution && <button onClick={() => setResolution("")}>{resolution} <X size={12} /></button>}{mood && <button onClick={() => setMood("")}>{mood} <X size={12} /></button>}{color && <button onClick={() => setColor("")}>{colorsLabel} <X size={12} /></button>}{search && <button onClick={() => setSearch("")}>{search} <X size={12} /></button>}{sort !== "newest" && <button onClick={() => setSort("newest")}>{sort === "popular" ? "محبوب‌ترین" : sort === "resolution" ? "وضوح" : sort === "aspect" ? "نسبت تصویر" : "حجم"} <X size={12} /></button>}<button className="clear-all-filters" onClick={clearFilters}>پاک‌کردن همه</button></div>}
        {query.isLoading ? <div className="loading-line" role="status"><span className="spinner" /> در حال آماده‌کردن گنجینه...</div> : query.error ? <div className="empty-state"><div className="empty-icon"><ImageIcon /></div><h3>بارگذاری انجام نشد</h3><p>اتصال به کاتالوگ با مشکل روبه‌رو شد. صفحه را دوباره بارگذاری کنید.</p><button className="button-secondary" onClick={() => void query.refetch()}>تلاش دوباره</button></div> : wallpapers.length ? <>
          <p className="sr-only" role="status" aria-live="polite">نمایش {shownFrom} تا {shownTo} از {total} والپیپر، صفحهٔ {page} از {totalPages}</p>
          <div className="wallpaper-grid home-wallpaper-gallery" aria-busy={query.isFetching}>{wallpapers.map(wallpaper => <WallpaperCard key={wallpaper.id} wallpaper={wallpaper} presentation="gallery" showActions={false} />)}</div>
          {totalPages > 1 && <nav className="catalog-pagination" aria-label="صفحه‌بندی گنجینه"><button className="button-secondary" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronRight size={16} /> قبلی</button><span aria-live="polite">{shownFrom.toLocaleString("fa-IR")}–{shownTo.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")} · صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button className="button-secondary" disabled={page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>بعدی <ChevronLeft size={16} /></button></nav>}
        </> : <div className="empty-state"><div className="empty-icon"><ImageIcon size={25} /></div><h3>{hasFilters ? "نتیجه‌ای پیدا نشد" : "گنجینه در حال آماده‌شدن است"}</h3><p>{hasFilters ? "فیلترها را تغییر بده یا عبارت دیگری جست‌وجو کن." : "به‌زودی والپیپرهای گیمینگ تازه به این گنجینه اضافه می‌شوند."}</p>{hasFilters && <button className="button-secondary" onClick={clearFilters}>پاک‌کردن فیلترها</button>}</div>}
      </section>
    </main>
  );
}
