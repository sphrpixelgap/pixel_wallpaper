import { useState } from "react";
import { Download, Heart, Info, Maximize2, Minimize2 } from "lucide-react";
import { Link } from "wouter";
import type { Wallpaper } from "@/lib/trpc";
import { formatBytes, ratioLabel, slugifyGame, toggleFavorite, useFavorites } from "@/lib/wallpaper";

export default function WallpaperCard({ wallpaper, compact = false, presentation = "default", showActions = true, priority = false }: { wallpaper: Wallpaper; compact?: boolean; presentation?: "default" | "gallery"; showActions?: boolean; priority?: boolean }) {
  const favorites = useFavorites();
  const isFavorite = favorites.includes(wallpaper.id);
  const isGallery = presentation === "gallery";
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [showOriginalAspect, setShowOriginalAspect] = useState(false);
  const [showGalleryInfo, setShowGalleryInfo] = useState(false);
  const imageUrl = wallpaper.thumbnailUrl || wallpaper.imageUrl;
  const aspect = isGallery && !showOriginalAspect || !wallpaper.width || !wallpaper.height
    ? "16 / 9"
    : `${wallpaper.width} / ${wallpaper.height}`;

  return (
    <article className={`wallpaper-card ${compact ? "is-compact" : ""} ${isGallery ? "is-gallery" : ""} ${isGallery && showOriginalAspect ? "is-full-aspect" : ""}`}>
      <Link href={`/wallpapers/${wallpaper.id}`} className="wallpaper-image-link" style={{ aspectRatio: aspect }}>
        {isGallery && !imageLoaded && !imageFailed && <span className="gallery-image-placeholder" aria-hidden="true"><span /></span>}
        {!imageFailed && <img className={`wallpaper-image ${imageLoaded ? "is-loaded" : ""}`} src={imageUrl} alt={wallpaper.title} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onLoad={isGallery ? () => setImageLoaded(true) : undefined} onError={isGallery ? () => setImageFailed(true) : undefined} />}
        {isGallery && imageFailed && <span className="gallery-image-fallback" role="img" aria-label={`پیش‌نمایش «${wallpaper.title}» بارگذاری نشد`}><Info size={18} /><span>پیش‌نمایش در دسترس نیست</span></span>}
        {isGallery && <span className={`gallery-info-overlay ${showGalleryInfo ? "is-visible" : ""}`} aria-hidden="true"><strong>{wallpaper.title}</strong><span>{wallpaper.gameTitle || wallpaper.category}</span><small>{wallpaper.resolution}</small></span>}
        {!isGallery && showActions && <span className="image-overlay"><span>مشاهده</span></span>}
        {!isGallery && showActions && <span className="image-ratio"><Maximize2 size={12} /> {ratioLabel(wallpaper.width, wallpaper.height)}</span>}
      </Link>
      {showActions && <button className={`favorite-toggle ${isFavorite ? "is-favorite" : ""}`} onClick={() => toggleFavorite(wallpaper.id)} aria-label={isFavorite ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"} aria-pressed={isFavorite}><Heart size={17} fill={isFavorite ? "currentColor" : "none"} /></button>}
      {isGallery && showActions && <>
        <button type="button" className="gallery-fit-toggle" aria-label={showOriginalAspect ? "بازگشت به کادر گالری" : "نمایش کامل تصویر با نسبت اصلی"} aria-pressed={showOriginalAspect} title={showOriginalAspect ? "بازگشت به کادر گالری" : "نمایش کامل تصویر"} onClick={() => setShowOriginalAspect(current => !current)}>{showOriginalAspect ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        <button type="button" className="gallery-info-toggle" aria-label={showGalleryInfo ? "پنهان‌کردن اطلاعات تصویر" : "نمایش اطلاعات تصویر"} aria-expanded={showGalleryInfo} onClick={() => setShowGalleryInfo(current => !current)}><Info size={15} /></button>
      </>}
      <div className="wallpaper-card-info">
        <div className={`wallpaper-card-title ${isGallery ? "gallery-card-copy" : ""}`}>
          {isGallery ? <>
            <Link href={`/wallpapers/${wallpaper.id}`} className="wallpaper-title">{wallpaper.title}</Link>
          </> : <>
            <span className="category-label">{wallpaper.category}{wallpaper.mood && wallpaper.mood !== "سایر" ? ` · ${wallpaper.mood}` : ""}</span>
            <Link href={`/wallpapers/${wallpaper.id}`} className="wallpaper-title">{wallpaper.title}</Link>
            {wallpaper.gameTitle && <Link href={`/games/${slugifyGame(wallpaper.gameTitle)}`} className="game-mini-link">{wallpaper.gameTitle}</Link>}
          </>}
        </div>
        {!isGallery && <div className="wallpaper-meta"><span><Maximize2 size={13} /> {wallpaper.resolution}</span><span><Download size={13} /> {wallpaper.downloadCount.toLocaleString("fa-IR")}</span>{wallpaper.fileSize > 0 && <span className="file-size-meta">{formatBytes(wallpaper.fileSize)}</span>}</div>}
      </div>
    </article>
  );
}
