import { Download, Heart, Image as ImageIcon, Plus, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import WallpaperCard from "@/components/WallpaperCard";
import { trpc } from "@/lib/trpc";
import { exportFavoritesJson, parseFavoritesData, readFavoriteCollections, useFavorites, writeFavoriteCollections, writeFavorites, type FavoriteCollection } from "@/lib/wallpaper";

export default function Favorites() {
  const ids = useFavorites();
  const utils = trpc.useUtils();
  const [groups, setGroups] = useState<FavoriteCollection[]>(() => readFavoriteCollections());
  const [selected, setSelected] = useState<number | "all">("all");
  const [groupName, setGroupName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const query = trpc.wallpapers.byIds.useQuery({ ids: ids.slice(0, 1000) }, { enabled: ids.length > 0 });
  const records = new Map((query.data ?? []).map(wallpaper => [wallpaper.id, wallpaper]));
  const items = ids.flatMap(id => { const wallpaper = records.get(id); return wallpaper ? [wallpaper] : []; });
  const visibleItems = useMemo(() => selected === "all" ? items : items.filter(item => groups.find(group => group.id === selected)?.favoriteIds.includes(item.id)), [items, selected, groups]);
  const saveGroups = (next: FavoriteCollection[]) => { writeFavoriteCollections(next); setGroups(readFavoriteCollections()); };
  const createGroup = () => {
    const name = groupName.trim().slice(0, 32);
    if (!name) { setError("نام مجموعه را وارد کن."); return; }
    if (groups.length >= 31) { setError("حداکثر ۳۰ مجموعهٔ دلخواه می‌توان ساخت."); return; }
    const id = Math.max(1, ...groups.map(group => group.id)) + 1;
    saveGroups([...groups, { id, name, favoriteIds: [] }]); setGroupName(""); setError(""); setNotice(`مجموعهٔ «${name}» ساخته شد.`);
  };
  const renameGroup = (group: FavoriteCollection) => {
    const value = window.prompt("نام تازهٔ مجموعه (حداکثر ۳۲ نویسه):", group.name);
    if (value === null) return;
    const name = value.trim().slice(0, 32);
    if (!name) { setError("نام مجموعه نمی‌تواند خالی باشد."); return; }
    saveGroups(groups.map(item => item.id === group.id ? { ...item, name } : item)); setError(""); setNotice(`نام مجموعه به «${name}» تغییر کرد.`);
  };
  const deleteGroup = (group: FavoriteCollection) => {
    if (!window.confirm(`مجموعهٔ «${group.name}» حذف شود؟ علاقه‌مندی‌ها حذف نمی‌شوند.`)) return;
    saveGroups(groups.filter(item => item.id !== group.id)); if (selected === group.id) setSelected("all");
    setNotice(`مجموعهٔ «${group.name}» حذف شد.`);
  };
  const toggleMembership = (group: FavoriteCollection, favoriteId: number, add: boolean) => {
    saveGroups(groups.map(item => item.id !== group.id ? item : { ...item, favoriteIds: add ? [...new Set([...item.favoriteIds, favoriteId])].slice(0, 1000) : item.favoriteIds.filter(id => id !== favoriteId) }));
  };
  return (
    <main className="page-wrap" dir="rtl">
      <header className="page-header"><span className="eyebrow"><Heart size={14} /> مجموعهٔ شخصی تو</span><h1>علاقه‌مندی‌های تو</h1><p>والپیپرهایی که برای بعد نگه داشته‌ای؛ این فهرست و مجموعه‌ها فقط روی همین مرورگر ذخیره می‌شوند و با فایل JSON می‌توانی به دستگاه دیگری منتقلشان کنی.</p></header>
      <section aria-labelledby="collections-heading" className="favorite-transfer">
        <h2 id="collections-heading">مجموعه‌های من ({groups.length.toLocaleString("fa-IR")}/۳۱)</h2>
        <div className="favorite-transfer">
          <button className={`button-secondary${selected === "all" ? " active" : ""}`} type="button" aria-pressed={selected === "all"} onClick={() => setSelected("all")}>همه ({ids.length.toLocaleString("fa-IR")})</button>
          {groups.map(group => <div key={group.id}>
            <button className={`button-secondary${selected === group.id ? " active" : ""}`} type="button" aria-pressed={selected === group.id} onClick={() => setSelected(group.id)}>{group.name} ({group.favoriteIds.filter(id => ids.includes(id)).length.toLocaleString("fa-IR")})</button>
            {group.id === 1 ? <span className="favorite-default-tag">پیش‌فرض</span> : <><button className="button-secondary" type="button" aria-label={`تغییرنام ${group.name}`} onClick={() => renameGroup(group)}>تغییرنام</button>
            <button className="button-secondary" type="button" aria-label={`حذف ${group.name}`} onClick={() => deleteGroup(group)}><X size={14} /> حذف</button></>}
          </div>)}
        </div>
        <form className="favorite-transfer" onSubmit={event => { event.preventDefault(); createGroup(); }}>
          <label htmlFor="new-favorite-group">نام مجموعهٔ تازه</label>
          <input id="new-favorite-group" value={groupName} maxLength={32} onChange={event => setGroupName(event.target.value)} placeholder="مثلاً والپیپرهای سایبرپانکی" />
          <button className="button-secondary" type="submit" disabled={groups.length >= 31}><Plus size={15} /> ساخت مجموعه</button>
        </form>
      </section>
      <div className="favorite-transfer" aria-label="انتقال علاقه‌مندی‌ها">
        <button className="button-secondary" type="button" disabled={!ids.length} onClick={() => {
          const blob = new Blob([exportFavoritesJson(ids, groups)], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a"); link.href = url; link.download = "pixel-wallpaper-favorites.json"; link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          setNotice(`${ids.length.toLocaleString("fa-IR")} علاقه‌مندی صادر شد.`); setError("");
        }}><Download size={15} /> خروجی JSON</button>
        <label className="button-secondary favorite-import"><Upload size={15} /> ورود فایل JSON<input type="file" accept="application/json,.json" aria-label="انتخاب فایل JSON علاقه‌مندی‌ها" onChange={async event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
          if (!file) return;
          setError(""); setNotice("");
          try {
            const imported = parseFavoritesData(await file.text());
            const existing = await utils.wallpapers.byIds.fetch({ ids: imported.favorites });
            const available = [...new Set(existing.map(item => item.id))];
            writeFavorites(available);
            const validSet = new Set(available);
            const importedGroups = imported.collections.map(group => ({ ...group, favoriteIds: group.favoriteIds.filter(id => validSet.has(id)) }));
            saveGroups(importedGroups);
            setSelected("all");
            setNotice(`${available.length.toLocaleString("fa-IR")} علاقه‌مندی وارد شد${available.length < imported.favorites.length ? `؛ ${(imported.favorites.length - available.length).toLocaleString("fa-IR")} شناسه در این گنجینه پیدا نشد` : ""}.`);
          } catch (cause) { setError(cause instanceof Error ? cause.message : "خواندن فایل انجام نشد."); }
        }} /></label>
      </div>
      {notice && <p className="success-text" role="status">{notice}</p>}{error && <p className="error-text" role="alert">{error}</p>}
      {query.isLoading ? <div className="loading-line"><span className="spinner" /> در حال بارگذاری...</div> : visibleItems.length ? <div className="wallpaper-grid">{visibleItems.map(wallpaper => <article key={wallpaper.id}>
        <WallpaperCard wallpaper={wallpaper} />
        {groups.length > 0 && <fieldset className="favorite-group-membership"><legend>مجموعه‌ها</legend>{groups.map(group => <label key={group.id}><input type="checkbox" disabled={group.id === 1} checked={group.favoriteIds.includes(wallpaper.id)} onChange={event => toggleMembership(group, wallpaper.id, event.target.checked)} /> {group.name}</label>)}</fieldset>}
      </article>)}</div> : <div className="empty-state"><div className="empty-icon"><ImageIcon size={25} /></div><h3>{items.length && selected !== "all" ? "این مجموعه خالی است" : "هنوز چیزی ذخیره نکرده‌ای"}</h3><p>{items.length && selected !== "all" ? "با انتخاب مجموعه‌ها در پایین هر والپیپر، آن را به این مجموعه اضافه کن." : "با لمس قلب روی هر والپیپر، آن را اینجا نگه دار تا راحت‌تر پیدایش کنی."}</p><Link className="button-primary" href="/">کشف والپیپرها</Link></div>}
    </main>
  );
}
