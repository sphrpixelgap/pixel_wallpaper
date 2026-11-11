import { useState, type FormEvent } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

type Edit = { value: string; busy: boolean; error: string };
export default function AdminTaxonomyPanel() {
  const query = trpc.taxonomy.adminList.useQuery();
  const utils = trpc.useUtils();
  const [newCategory, setNewCategory] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const create = trpc.taxonomy.createCategory.useMutation();
  const renameCategory = trpc.taxonomy.renameCategory.useMutation();
  const deleteCategory = trpc.taxonomy.deleteCategory.useMutation();
  const renameGame = trpc.taxonomy.renameGame.useMutation();
  const removeGame = trpc.taxonomy.removeGame.useMutation();
  const renameTag = trpc.taxonomy.renameTag.useMutation();
  const removeTag = trpc.taxonomy.removeTag.useMutation();
  const refresh = async () => { await Promise.all([utils.taxonomy.adminList.invalidate(), utils.taxonomy.categories.invalidate(), utils.wallpapers.list.invalidate(), utils.games.list.invalidate(), utils.admin.list.invalidate(), utils.admin.overview.invalidate()]); };
  const start = (key: string, value: string) => setEdits(prev => ({ ...prev, [key]: { value, busy: false, error: "" } }));
  const setValue = (key: string, value: string) => setEdits(prev => ({ ...prev, [key]: { ...(prev[key] ?? { busy: false, error: "" }), value } }));
  const cancel = (key: string) => setEdits(prev => { const next = { ...prev }; delete next[key]; return next; });
  const act = async (key: string, action: () => Promise<unknown>) => {
    setEdits(prev => ({ ...prev, [key]: { ...(prev[key] ?? { value: "", busy: false, error: "" }), busy: true, error: "" } }));
    try { await action(); await refresh(); cancel(key); }
    catch (error) { setEdits(prev => ({ ...prev, [key]: { ...(prev[key] ?? { value: "", busy: false, error: "" }), busy: false, error: error instanceof Error ? error.message : "عملیات انجام نشد." } })); }
  };
  const addCategory = async (event: FormEvent) => { event.preventDefault(); const name = newCategory.trim(); if (!name) return; setCategoryError(""); try { await create.mutateAsync({ name }); setNewCategory(""); await refresh(); } catch (error) { setCategoryError(error instanceof Error ? error.message : "افزودن دسته‌بندی ناموفق بود."); } };
  const field = (key: string, value: string, save: () => void) => { const edit = edits[key]; return edit ? <div style={{ minWidth: 170 }}><input value={edit.value} onChange={e => setValue(key, e.target.value)} disabled={edit.busy} aria-label="نام جدید" /><div className="admin-row-actions"><button className="icon-button" type="button" disabled={edit.busy || !edit.value.trim()} onClick={save} title="ذخیره"><Check size={15} /></button><button className="icon-button" type="button" disabled={edit.busy} onClick={() => cancel(key)} title="لغو"><X size={15} /></button></div>{edit.error && <small className="error-text" role="alert">{edit.error}</small>}</div> : <strong>{value}</strong>; };
  return <section className="admin-panel" dir="rtl"><div className="admin-top"><div><h2>مدیریت دسته‌بندی‌ها و برچسب‌ها</h2><p>ویرایش دسته‌بندی، بازی و برچسب‌های محتوای سایت.</p></div></div>
    {query.isLoading ? <div className="loading-line">در حال دریافت اطلاعات…</div> : query.error ? <div className="notice-box" role="alert">دریافت اطلاعات ناموفق بود: {query.error.message}</div> : !query.data ? null : <>
      <form className="form-actions" onSubmit={addCategory} style={{ marginBottom: 20, flexWrap: "wrap" }}><input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="نام دسته‌بندی جدید" aria-label="نام دسته‌بندی جدید" required /><button className="button-primary" type="submit" disabled={create.isPending}><Plus size={15} /> افزودن دسته‌بندی</button>{categoryError && <span className="error-text" role="alert">{categoryError}</span>}</form>
      <h3 className="admin-list-heading">دسته‌بندی‌ها</h3>{query.data.categories.length ? <div className="admin-list">{query.data.categories.map(row => { const key = `category-${row.id}`; return <article className="admin-row" key={key}><div className="admin-row-main">{field(key, row.name, () => void act(key, () => renameCategory.mutateAsync({ id: row.id, name: edits[key].value.trim() })))}<span>{row.wallpaperCount.toLocaleString("fa-IR")} والپیپر</span></div><div className="admin-row-actions">{!edits[key] && <><button className="icon-button" type="button" title="تغییر نام" onClick={() => start(key, row.name)}><Pencil size={15} /></button><button className="icon-button danger" type="button" title={row.wallpaperCount ? "دسته‌بندی دارای والپیپر است" : "حذف دسته‌بندی"} disabled={row.wallpaperCount !== 0 || deleteCategory.isPending} onClick={() => { if (window.confirm(`دسته‌بندی «${row.name}» حذف شود؟`)) void act(key, () => deleteCategory.mutateAsync({ id: row.id })); }}><Trash2 size={15} /></button></>}</div></article>; })}</div> : <div className="empty-state">هنوز دسته‌بندی‌ای ثبت نشده است.</div>}
      <h3 className="admin-list-heading" style={{ marginTop: 24 }}>بازی‌ها</h3>{query.data.games.length ? <div className="admin-list">{query.data.games.map(row => { const key = `game-${row.gameTitle}`; return <article className="admin-row" key={key}><div className="admin-row-main">{field(key, row.gameTitle, () => void act(key, () => renameGame.mutateAsync({ oldName: row.gameTitle, newName: edits[key].value.trim() })))}<span>{row.wallpaperCount.toLocaleString("fa-IR")} والپیپر</span></div><div className="admin-row-actions">{!edits[key] && <><button className="icon-button" type="button" title="تغییر نام" onClick={() => start(key, row.gameTitle)}><Pencil size={15} /></button><button className="icon-button danger" type="button" title="حذف ارتباط بازی" onClick={() => { if (window.confirm(`ارتباط «${row.gameTitle}» با والپیپرها حذف شود؟`)) { start(key, row.gameTitle); void act(key, () => removeGame.mutateAsync({ name: row.gameTitle })); } }}><Trash2 size={15} /></button></>}</div></article>; })}</div> : <div className="empty-state">بازی‌ای برای نمایش وجود ندارد.</div>}
      <h3 className="admin-list-heading" style={{ marginTop: 24 }}>برچسب‌ها</h3>{query.data.tags.length ? <div className="admin-list">{query.data.tags.map(row => { const key = `tag-${row.name}`; return <article className="admin-row" key={key}><div className="admin-row-main">{field(key, row.name, () => void act(key, () => renameTag.mutateAsync({ oldName: row.name, newName: edits[key].value.trim() })))}<span>{row.usageCount.toLocaleString("fa-IR")} بار استفاده</span></div><div className="admin-row-actions">{!edits[key] && <><button className="icon-button" type="button" title="تغییر نام" onClick={() => start(key, row.name)}><Pencil size={15} /></button><button className="icon-button danger" type="button" title="حذف برچسب" onClick={() => { if (window.confirm(`برچسب «${row.name}» حذف شود؟`)) { start(key, row.name); void act(key, () => removeTag.mutateAsync({ name: row.name })); } }}><Trash2 size={15} /></button></>}</div></article>; })}</div> : <div className="empty-state">برچسبی ثبت نشده است.</div>}
    </>}
  </section>;
}
