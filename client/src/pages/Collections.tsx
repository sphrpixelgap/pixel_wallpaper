import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowRight, ChevronLeft, ChevronRight, Layers3 } from "lucide-react";
import { collections, getCollection } from "@shared/collections";
import { trpc } from "@/lib/trpc";
import { getResponsiveImageSource } from "@/lib/imagekit";
import WallpaperCard from "@/components/WallpaperCard";
import NotFound from "@/pages/NotFound";

const PAGE_SIZE = 24;

function CollectionTile({ collection }: { collection: (typeof collections)[number] }) {
  const sample = trpc.wallpapers.page.useQuery({ ...collection.filters, page: 1, pageSize: 1 });
  const wallpaper = sample.data?.items[0];
  const imageSource = wallpaper ? getResponsiveImageSource(wallpaper.thumbnailUrl || wallpaper.imageUrl, [320, 480], { quality: 80, maxWidth: 480 }) : undefined;
  return <Link href={`/collections/${collection.slug}`} className="collection-tile" style={{ "--collection-accent": collection.accent } as React.CSSProperties}>
    <div className="collection-tile-art">{wallpaper && imageSource ? <img src={imageSource.src} srcSet={imageSource.srcSet} sizes="(max-width: 650px) 50vw, 25vw" alt="" loading="lazy" /> : <span className="collection-art-mark"><Layers3 size={34} /></span>}<span className="collection-art-shade" /></div>
    <div className="collection-tile-copy"><span className="section-kicker">مجموعهٔ آماده</span><h2>{collection.title}</h2><p>{collection.description}</p><span className="collection-tile-cta">مشاهدهٔ مجموعه <ChevronLeft size={16} /></span></div>
  </Link>;
}

export function CollectionsIndex() {
  return <main className="page-wrap collections-page"><header className="page-header"><span className="eyebrow"><i /> انتخاب‌های ویژه</span><h1>مجموعه‌های آماده</h1><p>برای حال‌وهوای دلخواهت، یک مجموعه را انتخاب کن.</p></header><div className="collections-grid">{collections.map(collection => <CollectionTile key={collection.slug} collection={collection} />)}</div></main>;
}

export function CollectionDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const collection = getCollection(slug);
  const [page, setPage] = useState(1);
  const query = trpc.wallpapers.page.useQuery({ ...(collection?.filters ?? {}), page, pageSize: PAGE_SIZE }, { enabled: Boolean(collection), placeholderData: previous => previous });
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [slug]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  useEffect(() => { if (collection) document.title = `${collection.title} | مجموعه‌های پیکسل والپیپر`; return () => { document.title = "پیکسل والپیپر | والپیپر گیمینگ"; }; }, [collection]);

  if (!collection) return <NotFound />;

  return <main className="page-wrap collections-page"><header className="page-header"><Link href="/collections" className="eyebrow"><ArrowRight size={15} /> همهٔ مجموعه‌ها</Link><h1>{collection.title}</h1><p>{collection.description}</p></header>
    {query.isLoading ? <div className="loading-line"><span className="spinner" /> در حال بارگذاری والپیپرها...</div> : query.isError ? <div className="empty-state" role="alert"><h3>بارگذاری مجموعه ممکن نشد</h3><p>لطفاً کمی بعد دوباره تلاش کن.</p></div> : total > 0 ? <>
      <div className="collections-result-meta">{total.toLocaleString("fa-IR")} والپیپر <span>صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span></div>
      <div className="wallpaper-grid" aria-busy={query.isFetching}>{query.data?.items.map(wallpaper => <WallpaperCard key={wallpaper.id} wallpaper={wallpaper} />)}</div>
      {totalPages > 1 && <nav className="featured-pagination" aria-label="صفحه‌بندی والپیپرهای مجموعه"><button type="button" className="button-secondary" disabled={query.isFetching || page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronRight size={15} /> قبلی</button><span aria-live="polite">صفحهٔ {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span><button type="button" className="button-secondary" disabled={query.isFetching || page >= totalPages} onClick={() => setPage(current => Math.min(totalPages, current + 1))}>بعدی <ChevronLeft size={15} /></button></nav>}
    </> : <div className="empty-state"><div className="empty-icon"><Layers3 /></div><h3>هنوز والپیپری در این مجموعه نیست</h3><p>فعلاً تصویری با این فیلترها در گنجینه پیدا نشد. مجموعهٔ دیگری را امتحان کن.</p><Link className="button-primary" href="/collections">بازگشت به مجموعه‌ها</Link></div>}
  </main>;
}
