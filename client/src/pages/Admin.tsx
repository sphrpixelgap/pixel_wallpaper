import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Archive, ArrowLeft, Check, HeartPulse, History, ImagePlus, LayoutDashboard, Layers, LogOut, MessageSquareText, Pencil, Settings2, ShieldAlert, Tags, Trash2, Upload, UserRoundCog, Users, X } from "lucide-react";
import { trpc, type AdminWallpaper, type Wallpaper } from "@/lib/trpc";
import { getResponsiveImageSource } from "@/lib/imagekit";
import { hasAdminPermission, type AdminPermissionKey } from "@shared/admin-permissions";
import { categories, colors, deviceForDimensions, devices, formatBytes, moods, resolutionForDimensions } from "@/lib/wallpaper";
import { blobAsFile, processWallpaperImage } from "@/lib/image-processing";
import AdminSettingsPanel from "@/components/admin/AdminSettingsPanel";
import AdminTaxonomyPanel from "@/components/admin/AdminTaxonomyPanel";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";
import AdminAccountsPanel from "@/components/admin/AdminAccountsPanel";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import AdminReviewQueue from "@/components/admin/AdminReviewQueue";
import AdminContentHealth from "@/components/admin/AdminContentHealth";
import AdminIssueReports from "@/components/admin/AdminIssueReports";
import AdminActivityLog from "@/components/admin/AdminActivityLog";
import AdminActionableStats from "@/components/admin/AdminActionableStats";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const REQUEST_PAGE_SIZE = 20;
type ExtraVariantSummary = { id: number; resolution: string; targetDevice: string; width: number; height: number; fileSize: number | null };
const colorLabels = Object.fromEntries(colors.map(item => [item.value, item.label]));
const deviceLabels = Object.fromEntries(devices.map(item => [item.value, item.label]));
const requestStatusLabels = { new: "جدید", reviewed: "بررسی‌شده", completed: "انجام‌شده" } as const;
const adminNavigation = [
  { id: "overview", hash: "admin-dashboard", label: "نمای کلی", icon: LayoutDashboard },
  { id: "activity", hash: "admin-activity", label: "تاریخچهٔ فعالیت", icon: History },
  { id: "wallpapers", hash: "admin-wallpapers", label: "والپیپرها", icon: ImagePlus },
  { id: "review", hash: "admin-review", label: "صف بازبینی", icon: Check },
  { id: "health", hash: "admin-health", label: "سلامت محتوا", icon: HeartPulse },
  { id: "requests", hash: "admin-requests", label: "درخواست‌ها", icon: MessageSquareText },
  { id: "reports", hash: "admin-reports", label: "گزارش مشکل", icon: HeartPulse },
  { id: "taxonomy", hash: "admin-taxonomy", label: "دسته‌ها و برچسب‌ها", icon: Tags },
  { id: "settings", hash: "admin-settings", label: "تنظیمات سایت", icon: Settings2 },
  { id: "admins", hash: "admin-managers", label: "مدیران", icon: UserRoundCog },
  { id: "users", hash: "admin-users", label: "حساب‌های سایت", icon: Users },
] as const;
type AdminSection = (typeof adminNavigation)[number]["id"];
const sectionPermissions: Record<AdminSection, AdminPermissionKey | null> = {
  overview: "overview", activity: "overview", wallpapers: "wallpapers", review: "wallpapers", health: "wallpapers",
  requests: "requests", reports: "requests", taxonomy: "taxonomy", settings: "settings", admins: null, users: "users",
};

function sectionFromHash(): AdminSection {
  if (typeof window === "undefined") return "overview";
  return adminNavigation.find(section => section.hash === window.location.hash.slice(1))?.id ?? "overview";
}

async function inspectFile(file: File) {
  const bitmap = await createImageBitmap(file);
  const meta = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return meta;
}

export default function Admin() {
  const utils = trpc.useUtils();
  const adminStatus = trpc.adminAuth.status.useQuery(undefined, { retry: false, refetchInterval: 30_000, refetchOnWindowFocus: true });
  const adminAccount = adminStatus.data?.account ?? null;
  const isAdmin = Boolean(adminAccount && !adminAccount.mustChangePassword);
  const isOwner = Boolean(isAdmin && adminAccount?.role === "owner");
  const canAccessSection = (section: AdminSection) => section === "admins"
    ? isOwner
    : Boolean(adminAccount && sectionPermissions[section] && hasAdminPermission(adminAccount.role, adminAccount.permissions, sectionPermissions[section]!));
  const visibleNavigation = adminNavigation.filter(item => canAccessSection(item.id));
  const permissionFingerprint = adminAccount ? ["overview", "wallpapers", "requests", "taxonomy", "settings", "users"].map(key => adminAccount.permissions[key as keyof typeof adminAccount.permissions] ? "1" : "0").join("") : "";
  const adminLogout = trpc.adminAuth.logout.useMutation();
  const [logoutError, setLogoutError] = useState("");
  const [activeSection, setActiveSection] = useState<AdminSection>(sectionFromHash);
  const [showDuplicateCandidates, setShowDuplicateCandidates] = useState(false);
  const [requestPage, setRequestPage] = useState(1);
  const [wallpaperPage, setWallpaperPage] = useState(1);
  const [wallpaperSearch, setWallpaperSearch] = useState("");
  const [wallpaperCategoryFilter, setWallpaperCategoryFilter] = useState("");
  const [wallpaperStateFilter, setWallpaperStateFilter] = useState<"all" | "active" | "archived" | "pending" | "draft">("all");
  const [healthEditId, setHealthEditId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState("setCategory");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkNotice, setBulkNotice] = useState("");
  const overview = trpc.admin.overview.useQuery(undefined, { enabled: isAdmin && canAccessSection("overview") && activeSection === "overview", retry: false });
  const managedAccounts = trpc.adminAuth.accounts.useQuery(undefined, { enabled: isOwner && activeSection === "overview", retry: false });
  const list = trpc.admin.listPage.useQuery({ page: wallpaperPage, pageSize: 25, q: wallpaperSearch.trim() || undefined, category: wallpaperCategoryFilter || undefined, state: wallpaperStateFilter }, { enabled: isAdmin && canAccessSection("wallpapers") && activeSection === "wallpapers", retry: false });
  const healthEdit = trpc.admin.getForEdit.useQuery({ id: healthEditId ?? 1 }, { enabled: isAdmin && canAccessSection("wallpapers") && activeSection === "wallpapers" && healthEditId !== null, retry: false });
  const duplicateCandidates = trpc.admin.duplicateCandidates.useQuery(undefined, { enabled: isAdmin && canAccessSection("wallpapers") && activeSection === "wallpapers" && showDuplicateCandidates, retry: false });
  const bulkUpdate = trpc.admin.bulkUpdate.useMutation();
  const create = trpc.admin.create.useMutation();
  const update = trpc.admin.update.useMutation();
  const archive = trpc.admin.archive.useMutation();
  const setPublicationStatus = trpc.admin.setPublicationStatus.useMutation();
  const deletePermanently = trpc.admin.deletePermanently.useMutation();
  const deleteExtraVariants = trpc.admin.deleteExtraVariants.useMutation();
  const deleteVariant = trpc.admin.deleteVariant.useMutation();
  const requests = trpc.requests.adminList.useQuery({ page: requestPage }, { enabled: isAdmin && canAccessSection("requests") && activeSection === "requests", retry: false });
  const updateRequestStatus = trpc.requests.updateStatus.useMutation();
  const deleteRequest = trpc.requests.deletePermanently.useMutation();
  const categoryQuery = trpc.taxonomy.categories.useQuery(undefined, { enabled: isAdmin && canAccessSection("wallpapers") && activeSection === "wallpapers", retry: false });
  const [editing, setEditing] = useState<AdminWallpaper | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [gameTitle, setGameTitle] = useState("");
  const [tags, setTags] = useState("");
  const [mood, setMood] = useState(moods[0]);
  const [color, setColor] = useState("purple");
  const [targetDevice, setTargetDevice] = useState("desktop");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [variantFiles, setVariantFiles] = useState<File[]>([]);
  const [dimensions, setDimensions] = useState<{ width: number | null; height: number | null }>({ width: null, height: null });
  const [variantDimensions, setVariantDimensions] = useState<{ file: File; width: number; height: number; device: "desktop" | "mobile" | "ultrawide" }[]>([]);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestStatusError, setRequestStatusError] = useState("");
  const [requestDeleteError, setRequestDeleteError] = useState("");
  const [variantNotice, setVariantNotice] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    void inspectFile(file).then(meta => {
      setDimensions(meta);
      setTargetDevice(deviceForDimensions(meta.width, meta.height));
    }).catch(() => setError("خواندن ابعاد تصویر انتخاب‌شده ممکن نیست."));
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(variantFiles.map(async item => {
      const meta = await inspectFile(item);
      return { file: item, ...meta, device: deviceForDimensions(meta.width, meta.height) };
    })).then(result => { if (!cancelled) setVariantDimensions(result); })
      .catch(() => { if (!cancelled) setError("یکی از نسخه‌های اضافی تصویر قابل خواندن نیست."); });
    return () => { cancelled = true; };
  }, [variantFiles]);

  const activeCount = list.data?.activeCount ?? 0;
  const listItems = list.data?.items ?? [];
  const totalWallpaperPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 25));
  const allPageSelected = listItems.length > 0 && listItems.every(item => selectedIds.includes(item.id));
  const categoryOptions = categoryQuery.data ?? categories;
  const totalRequestPages = Math.max(1, Math.ceil((requests.data?.total ?? 0) / REQUEST_PAGE_SIZE));

  useEffect(() => {
    const syncSection = () => {
      const requestedSection = sectionFromHash();
      if (adminStatus.isLoading || !adminAccount) {
        setActiveSection(requestedSection);
        return;
      }
      const section = canAccessSection(requestedSection) ? requestedSection : visibleNavigation[0]?.id ?? null;
      if (!section) {
        if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        setActiveSection("overview");
      } else {
        if (section !== requestedSection) {
          const hash = adminNavigation.find(item => item.id === section)?.hash ?? "admin-dashboard";
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${hash}`);
        }
        setActiveSection(section);
      }
      if (section !== "wallpapers") { setSelectedIds([]); setShowDuplicateCandidates(false); }
    };
    window.addEventListener("popstate", syncSection);
    window.addEventListener("hashchange", syncSection);
    return () => {
      window.removeEventListener("popstate", syncSection);
      window.removeEventListener("hashchange", syncSection);
    };
  }, [adminStatus.isLoading, adminAccount?.id, adminAccount?.role, permissionFingerprint]);

  function navigateSection(section: AdminSection) {
    const nextSection = canAccessSection(section) ? section : visibleNavigation[0]?.id;
    if (!nextSection) return;
    const hash = adminNavigation.find(item => item.id === nextSection)?.hash ?? "admin-dashboard";
    const url = `${window.location.pathname}${window.location.search}#${hash}`;
    if (window.location.hash !== `#${hash}`) window.history.pushState(null, "", url);
    setActiveSection(nextSection);
    if (nextSection !== "wallpapers") { setSelectedIds([]); setShowDuplicateCandidates(false); }
  }

  useEffect(() => {
    if (!editing && categoryOptions.length > 0 && !categoryOptions.includes(category)) setCategory(categoryOptions[0]);
  }, [categoryOptions, category, editing]);

  useEffect(() => { setWallpaperPage(1); setSelectedIds([]); }, [wallpaperSearch, wallpaperCategoryFilter, wallpaperStateFilter]);
  useEffect(() => { setSelectedIds([]); }, [wallpaperPage]);
  useEffect(() => { if (wallpaperPage > totalWallpaperPages) setWallpaperPage(totalWallpaperPages); }, [wallpaperPage, totalWallpaperPages]);

  function beginEdit(item: AdminWallpaper) {
    setEditing(item); setTitle(item.title); setCategory(item.category); setGameTitle(item.gameTitle ?? "");
    setTags(item.tags ?? ""); setMood(item.mood); setColor(item.dominantColor); setTargetDevice(item.targetDevice);
    setDescription(item.description ?? ""); setDimensions({ width: item.width, height: item.height });
    setFile(null); setVariantFiles([]); setError(""); setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null); setTitle(""); setCategory(categoryOptions[0] ?? categories[0]); setGameTitle(""); setTags("");
    setMood(moods[0]); setColor("purple"); setTargetDevice("desktop"); setDescription("");
    setDimensions({ width: null, height: null }); setFile(null); setVariantFiles([]); setError(""); setSuccess("");
  }

  useEffect(() => {
    if (activeSection !== "wallpapers" || healthEditId === null) return;
    if (healthEdit.data) { beginEdit(healthEdit.data); setHealthEditId(null); }
    else if (healthEdit.error) { setError(healthEdit.error.message); setHealthEditId(null); }
  }, [activeSection, healthEditId, healthEdit.data, healthEdit.error]);

  function openHealthItem(id: number, _title: string) {
    setHealthEditId(id); setWallpaperSearch(""); setWallpaperCategoryFilter(""); setWallpaperStateFilter("all"); setWallpaperPage(1); navigateSection("wallpapers");
  }

  async function uploadImage(imageFile: File) {
    const response = await fetch("/api/admin/upload?purpose=wallpaper", {
      method: "POST", credentials: "include", headers: { "Content-Type": imageFile.type }, body: imageFile,
    });
    const data = await response.json() as { key?: string; url?: string; fileId?: string; error?: string };
    if (!response.ok || !data.key || !data.url || !data.fileId) throw new Error(data.error ?? "بارگذاری تصویر انجام نشد.");
    return { imageKey: data.key, imageUrl: data.url, imageFileId: data.fileId, imageMime: imageFile.type as "image/webp", fileSize: imageFile.size };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publicationStatus = submitter?.dataset.publicationStatus === "draft" ? "draft" : "pending";
    if (!title.trim()) { setError("عنوان والپیپر را وارد کنید."); return; }
    if (!categoryOptions.includes(category)) { setError("ابتدا یک دسته‌بندی در بخش مدیریت دسته‌ها بسازید یا انتخاب کنید."); return; }
    if (!editing && !file) { setError("برای والپیپر جدید یک تصویر انتخاب کنید."); return; }
    if (file && (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > MAX_FILE_SIZE)) { setError("فقط PNG، JPG یا WEBP تا حجم ۱۲ مگابایت مجاز است."); return; }
    if (variantFiles.length > 8) { setError("حداکثر ۸ نسخهٔ دانلودی اضافه کنید."); return; }
    if (variantFiles.some(item => !item.type.match(/^image\/(png|jpeg|webp)$/) || item.size > MAX_FILE_SIZE)) { setError("هر نسخه باید PNG، JPG یا WEBP و حداکثر ۱۲ مگابایت باشد."); return; }
    setBusy(true);
    try {
      let imageData: { imageKey: string; imageUrl: string; imageFileId: string; imageMime: "image/webp"; fileSize: number; thumbnailKey?: string; thumbnailUrl?: string; thumbnailFileId?: string } | undefined;
      let mainDimensions = dimensions;
      if (file) {
        const processed = await processWallpaperImage(file);
        mainDimensions = { width: processed.width, height: processed.height };
        const [original, thumbnail] = await Promise.all([
          uploadImage(blobAsFile(processed.original, `${file.name.replace(/\.[^.]+$/, "")}.webp`)),
          uploadImage(blobAsFile(processed.thumbnail, `thumbnail-${crypto.randomUUID()}.webp`)),
        ]);
        imageData = { ...original, thumbnailKey: thumbnail.imageKey, thumbnailUrl: thumbnail.imageUrl, thumbnailFileId: thumbnail.imageFileId };
      }
      const variants = await Promise.all(variantFiles.map(async variantFile => {
        const processed = await processWallpaperImage(variantFile);
        const uploaded = await uploadImage(blobAsFile(processed.original, `${variantFile.name.replace(/\.[^.]+$/, "")}.webp`));
        return { ...uploaded, width: processed.width, height: processed.height, resolution: resolutionForDimensions(processed.width, processed.height), targetDevice: deviceForDimensions(processed.width, processed.height) };
      }));
      const mainResolution = mainDimensions.width && mainDimensions.height ? resolutionForDimensions(mainDimensions.width, mainDimensions.height) : editing?.resolution ?? "سفارشی";
      const fields = {
        title: title.trim(), category, gameTitle: gameTitle.trim() || null,
        tags: tags.split(",").map(value => value.trim()).filter(Boolean).slice(0, 30).join(", ") || null,
        mood, dominantColor: color as "purple" | "blue" | "red" | "green" | "orange" | "mono", targetDevice: targetDevice as "desktop" | "mobile" | "ultrawide",
        resolution: mainResolution, width: mainDimensions.width, height: mainDimensions.height,
        description: description.trim() || null,
        ...(imageData ?? (editing ? { imageKey: editing.imageKey, imageUrl: editing.imageUrl, imageFileId: editing.imageFileId ?? null, imageMime: editing.imageMime as "image/jpeg" | "image/png" | "image/webp", fileSize: editing.fileSize, thumbnailKey: editing.thumbnailKey, thumbnailUrl: editing.thumbnailUrl, thumbnailFileId: editing.thumbnailFileId ?? null } : {})),
      };
      if (editing) {
        await update.mutateAsync({ id: editing.id, data: fields, variants, replaceVariants: Boolean(imageData) });
      } else {
        await create.mutateAsync({ wallpaper: fields as Parameters<typeof create.mutateAsync>[0]["wallpaper"], variants, publicationStatus });
      }
      resetForm(); setSuccess(editing ? "اطلاعات و نسخه‌های والپیپر به‌روزرسانی شد." : publicationStatus === "draft" ? "والپیپر به‌عنوان پیش‌نویس ذخیره شد و عمومی نیست." : "والپیپر برای بازبینی ارسال شد و تا تأیید عمومی نمی‌شود.");
      await Promise.all([utils.admin.listPage.invalidate(), utils.admin.reviewQueue.invalidate(), utils.admin.overview.invalidate(), utils.admin.actionableStats.invalidate(), utils.admin.duplicateCandidates.invalidate(), utils.wallpapers.list.invalidate(), utils.wallpapers.page.invalidate(), utils.games.list.invalidate()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ذخیرهٔ والپیپر انجام نشد."); }
    finally { setBusy(false); }
  }

  async function archiveItem(item: Wallpaper) {
    if (!window.confirm(`«${item.title}» از فهرست عمومی پنهان شود؟ فایل ذخیره‌شده حذف فیزیکی نمی‌شود.`)) return;
    try { await archive.mutateAsync({ id: item.id }); await Promise.all([utils.admin.listPage.invalidate(), utils.admin.overview.invalidate(), utils.admin.duplicateCandidates.invalidate(), utils.wallpapers.list.invalidate(), utils.wallpapers.page.invalidate(), utils.games.list.invalidate()]); setSuccess("والپیپر از فهرست عمومی بایگانی شد."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "بایگانی انجام نشد."); }
  }

  async function submitDraftForReview(item: Wallpaper) {
    try {
      await setPublicationStatus.mutateAsync({ id: item.id, status: "pending" });
      await Promise.all([utils.admin.listPage.invalidate(), utils.admin.reviewQueue.invalidate(), utils.admin.overview.invalidate(), utils.admin.actionableStats.invalidate()]);
      setSuccess(`«${item.title}» برای بازبینی ارسال شد.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ارسال پیش‌نویس به بازبینی انجام نشد."); }
  }

  async function permanentlyDeleteItem(item: Wallpaper) {
    const confirmed = window.confirm(`حذف دائمی «${item.title}» از سایت و دیتابیس؟ رکورد نسخه‌های دانلودی وابسته هم پاک می‌شود و بازیابی‌اش ممکن نیست. به‌دلیل محدودیت Object Storage، فایل اصلی، thumbnail و نسخه‌ها ممکن است باقی بمانند و نشانی مستقیمشان همچنان کار کند.\n\nبرای تأیید نهایی، نام والپیپر را در پنجرهٔ بعدی وارد کنید.`);
    if (!confirmed) return;
    const titleConfirmation = window.prompt(`برای حذف دائمی، نام دقیق «${item.title}» را وارد کنید.`);
    if (titleConfirmation?.trim() !== item.title) return;
    try {
      await deletePermanently.mutateAsync({ id: item.id });
      await Promise.all([utils.admin.listPage.invalidate(), utils.admin.overview.invalidate(), utils.admin.duplicateCandidates.invalidate(), utils.wallpapers.list.invalidate(), utils.wallpapers.page.invalidate(), utils.games.list.invalidate(), utils.taxonomy.adminList.invalidate()]);
      setSuccess(`رکورد «${item.title}» از سایت و دیتابیس حذف شد؛ فایل ذخیره‌شده ممکن است باقی مانده باشد.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "حذف دائمی انجام نشد."); }
  }

  async function removeExtraVariants(item: Wallpaper & { extraVariantCount: number }) {
    if (!item.extraVariantCount) return;
    if (!window.confirm(`همهٔ ${item.extraVariantCount} نسخهٔ اضافهٔ «${item.title}» از دیتابیس حذف شوند؟ والپیپر اصلی باقی می‌ماند؛ فایل‌های Object Storage ممکن است حذف نشوند.`)) return;
    setVariantNotice({});
    try {
      await deleteExtraVariants.mutateAsync({ id: item.id });
      await Promise.all([utils.admin.listPage.invalidate(), utils.wallpapers.detail.invalidate(), utils.wallpapers.list.invalidate(), utils.wallpapers.page.invalidate()]);
      setVariantNotice({ success: `نسخه‌های اضافهٔ «${item.title}» حذف شدند؛ تصویر اصلی حفظ شد.` });
    } catch (cause) { setVariantNotice({ error: cause instanceof Error ? cause.message : "حذف نسخه‌ها انجام نشد." }); }
  }

  async function removeVariant(item: Wallpaper & { extraVariantCount: number }, variant: ExtraVariantSummary) {
    if (!window.confirm(`نسخهٔ ${variant.resolution} / ${deviceLabels[variant.targetDevice] ?? variant.targetDevice} از «${item.title}» حذف شود؟ تصویر اصلی باقی می‌ماند و فایل این نسخه ممکن است در Object Storage بماند.`)) return;
    setVariantNotice({});
    try {
      await deleteVariant.mutateAsync({ wallpaperId: item.id, variantId: variant.id });
      await Promise.all([utils.admin.listPage.invalidate(), utils.wallpapers.detail.invalidate(), utils.wallpapers.list.invalidate(), utils.wallpapers.page.invalidate()]);
      setVariantNotice({ success: `نسخهٔ ${variant.resolution} از «${item.title}» از سایت حذف شد؛ فایل ذخیره‌شده ممکن است باقی بماند.` });
    } catch (cause) { setVariantNotice({ error: cause instanceof Error ? cause.message : "حذف نسخه انجام نشد." }); }
  }

  async function setRequestStatus(id: number, status: "new" | "reviewed" | "completed") {
    setRequestStatusError("");
    try {
      await updateRequestStatus.mutateAsync({ id, status });
      await Promise.all([requests.refetch(), utils.admin.overview.invalidate()]);
    } catch (cause) {
      setRequestStatusError(cause instanceof Error ? cause.message : "به‌روزرسانی وضعیت درخواست انجام نشد.");
    }
  }

  async function deleteRequestItem(id: number, summary: string) {
    if (!window.confirm(`درخواست «${summary}» برای همیشه از صندوق و دیتابیس حذف شود؟ این کار قابل‌بازیابی نیست.`)) return;
    setRequestDeleteError("");
    try {
      await deleteRequest.mutateAsync({ id });
      if ((requests.data?.items.length ?? 0) <= 1 && requestPage > 1) setRequestPage(page => page - 1);
      else await requests.refetch();
      await utils.admin.overview.invalidate();
    }
    catch (cause) { setRequestDeleteError(cause instanceof Error ? cause.message : "حذف درخواست انجام نشد."); }
  }

  async function performBulkAction() {
    if (!selectedIds.length) return;
    let operation: { type: "setCategory"; value: string } | { type: "setGameTitle"; value: string } | { type: "setTags"; value: string } | { type: "archive" | "restore" };
    if (bulkAction === "setCategory") {
      if (!categoryOptions.includes(bulkValue)) { setBulkNotice("یک دسته‌بندی معتبر انتخاب کنید."); return; }
      operation = { type: "setCategory", value: bulkValue };
    } else if (bulkAction === "setGameTitle") operation = { type: "setGameTitle", value: bulkValue };
    else if (bulkAction === "setTags") operation = { type: "setTags", value: bulkValue };
    else operation = { type: bulkAction as "archive" | "restore" };
    const labels: Record<string, string> = { setCategory: "تغییر دسته‌بندی", setGameTitle: "تغییر نام بازی", setTags: "جایگزینی برچسب‌ها", archive: "بایگانی", restore: "بازگردانی" };
    if (!window.confirm(`${labels[bulkAction]} برای ${selectedIds.length} والپیپر انتخاب‌شده اجرا شود؟ حذف دائمی گروهی در این ابزار وجود ندارد.`)) return;
    setBulkNotice("");
    try {
      const result = await bulkUpdate.mutateAsync({ ids: selectedIds, operation });
      setBulkNotice(`تغییر روی ${result.updated.toLocaleString("fa-IR")} مورد اعمال شد.`);
      setSelectedIds([]);
      await Promise.all([utils.admin.listPage.invalidate(), utils.admin.overview.invalidate(), utils.admin.duplicateCandidates.invalidate(), utils.wallpapers.list.invalidate(), utils.wallpapers.page.invalidate(), utils.games.list.invalidate(), utils.taxonomy.adminList.invalidate()]);
    } catch (cause) { setBulkNotice(cause instanceof Error ? cause.message : "عملیات گروهی انجام نشد."); }
  }

  if (adminStatus.isLoading) return <main className="page-wrap"><div className="loading-line"><span className="spinner" /> بررسی نشست مدیریت...</div></main>;
  if (adminStatus.error || !adminStatus.data) return <main className="page-wrap"><section className="notice-box" role="alert">وضعیت ورود مدیریت دریافت نشد: {adminStatus.error?.message ?? "خطای نامشخص"}<button className="admin-inline-action" type="button" onClick={() => void adminStatus.refetch()}>تلاش دوباره</button></section></main>;
  if (!adminAccount || adminAccount.mustChangePassword) return <AdminAuthGate status={adminStatus.data} />;

  async function logoutAdmin() {
    setLogoutError("");
    try {
      await adminLogout.mutateAsync();
      await utils.adminAuth.status.invalidate();
    } catch (cause) { setLogoutError(cause instanceof Error ? cause.message : "خروج از پنل انجام نشد."); }
  }

  return <main className="page-wrap admin-portal">
    <header className="page-header"><span className="eyebrow"><ShieldAlert size={14} /> فضای سازندگان</span><h1>استودیوی والپیپر</h1><p>مدیریت گنجینه، درخواست‌ها، دسته‌بندی‌ها، تنظیمات سایت و دسترسی حساب‌ها.</p><div className="admin-auth-toolbar"><span dir="ltr">{adminAccount.username} · {isOwner ? "مالک" : "مدیر"}</span><button className="button-secondary" type="button" onClick={() => void logoutAdmin()} disabled={adminLogout.isPending}><LogOut size={14} /> خروج</button></div>{logoutError && <p className="error-text" role="alert">{logoutError}</p>}</header>
    <div className="admin-workspace">
      <nav className="admin-sidebar" aria-label="دسته‌های پنل مدیریت">
        {visibleNavigation.map(item => { const Icon = item.icon; const badge = item.id === "requests" && canAccessSection("overview") ? overview.data?.requests.new : item.id === "review" && canAccessSection("overview") ? overview.data?.wallpapers.pending : undefined; return <button key={item.id} type="button" className={activeSection === item.id ? "is-active" : ""} aria-current={activeSection === item.id ? "page" : undefined} onClick={() => navigateSection(item.id)}><Icon size={17} /><span>{item.label}</span>{(badge ?? 0) > 0 && <b>{badge!.toLocaleString("fa-IR")}</b>}</button>; })}
        <Link className="admin-site-link" href="/"><ArrowLeft size={16} /> مشاهدهٔ سایت</Link>
      </nav>
      <div className="admin-content">
        {!visibleNavigation.length && <div className="notice-box" role="status">برای این حساب هنوز بخشی فعال نشده است. از مالک سایت بخواهید دسترسی لازم را روشن کند.</div>}
        {activeSection === "overview" && canAccessSection("overview") && <section id="admin-dashboard" className="admin-dashboard">
          <div className="admin-dashboard-heading"><div><span className="eyebrow"><ShieldAlert size={14} /> دسترسی مدیر فعال است</span><h2>نمای کلی پنل</h2><p>خوش آمدید، {adminAccount.username}؛ مدیریت سایت را از اینجا ادامه دهید.</p></div><span className="admin-current-account" dir="ltr">{isOwner ? "Owner account" : "Admin account"}</span></div>
          {overview.isLoading ? <div className="admin-panel"><div className="loading-line"><span className="spinner" /> در حال جمع‌آوری آمار...</div></div> : overview.error ? <div className="notice-box" role="alert">آمار دریافت نشد. <button className="admin-inline-action" type="button" onClick={() => void overview.refetch()}>تلاش دوباره</button></div> : <div className="admin-metric-grid">
            <article className="admin-metric-card"><span><ImagePlus size={17} /> والپیپر فعال</span><strong>{overview.data?.wallpapers.active.toLocaleString("fa-IR") ?? "۰"}</strong>{canAccessSection("wallpapers") && <button type="button" onClick={() => navigateSection("wallpapers")}>مدیریت گنجینه <ArrowLeft size={14} /></button>}</article>
            <article className="admin-metric-card"><span><Archive size={17} /> بایگانی‌شده</span><strong>{overview.data?.wallpapers.archived.toLocaleString("fa-IR") ?? "۰"}</strong>{canAccessSection("wallpapers") && <button type="button" onClick={() => { setWallpaperStateFilter("archived"); navigateSection("wallpapers"); }}>دیدن بایگانی <ArrowLeft size={14} /></button>}</article>
            <article className="admin-metric-card"><span><MessageSquareText size={17} /> درخواست‌های جدید</span><strong>{overview.data?.requests.new.toLocaleString("fa-IR") ?? "۰"}</strong>{canAccessSection("requests") && <button type="button" onClick={() => navigateSection("requests")}>رفتن به صندوق <ArrowLeft size={14} /></button>}</article>
            <article className="admin-metric-card"><span><MessageSquareText size={17} /> کل درخواست‌ها</span><strong>{overview.data?.requests.total.toLocaleString("fa-IR") ?? "۰"}</strong>{canAccessSection("requests") && <button type="button" onClick={() => navigateSection("requests")}>مشاهدهٔ صندوق <ArrowLeft size={14} /></button>}</article>
            {canAccessSection("users") && <article className="admin-metric-card"><span><Users size={17} /> حساب‌های سایت</span><strong>{overview.data?.users.toLocaleString("fa-IR") ?? "۰"}</strong><button type="button" onClick={() => navigateSection("users")}>مدیریت دسترسی <ArrowLeft size={14} /></button></article>}
            {isOwner && <article className="admin-metric-card"><span><UserRoundCog size={17} /> مدیران اختصاصی</span><strong>{managedAccounts.data?.filter(account => account.role === "admin").length.toLocaleString("fa-IR") ?? "۰"}</strong><button type="button" onClick={() => navigateSection("admins")}>مدیریت مدیران <ArrowLeft size={14} /></button></article>}
            <article className="admin-metric-card"><span><Tags size={17} /> دسته‌بندی‌ها</span><strong>{overview.data?.categories.toLocaleString("fa-IR") ?? "۰"}</strong>{canAccessSection("taxonomy") && <button type="button" onClick={() => navigateSection("taxonomy")}>مدیریت دسته‌ها <ArrowLeft size={14} /></button>}</article>
          </div>}
          <div className="admin-panel admin-quick-actions"><h3>دسترسی سریع</h3><div>{canAccessSection("wallpapers") && <button className="button-primary" type="button" onClick={() => navigateSection("wallpapers")}><ImagePlus size={16} /> افزودن یا ویرایش والپیپر</button>}{canAccessSection("requests") && <button className="button-secondary" type="button" onClick={() => navigateSection("requests")}><MessageSquareText size={16} /> بررسی درخواست‌های کاربران</button>}{canAccessSection("settings") && <button className="button-secondary" type="button" onClick={() => navigateSection("settings")}><Settings2 size={16} /> ویرایش تنظیمات سایت</button>}{isOwner && <button className="button-secondary" type="button" onClick={() => navigateSection("admins")}><UserRoundCog size={16} /> مدیریت حساب مدیران</button>}</div></div>
          <AdminActionableStats canAccessWallpapers={canAccessSection("wallpapers")} canAccessRequests={canAccessSection("requests")} canAccessReview={canAccessSection("review")} onNavigate={section => navigateSection(section as AdminSection)} />
        </section>}
        {activeSection === "activity" && canAccessSection("activity") && <div id="admin-activity"><AdminActivityLog /></div>}
        {activeSection === "wallpapers" && canAccessSection("wallpapers") && <section id="admin-wallpapers" className="admin-panel"><div className="admin-top"><div><h2>والپیپرهای گنجینه</h2><p>{activeCount.toLocaleString("fa-IR")} والپیپر فعال · هر تصویر حداکثر ۱۲ مگابایت</p></div><Link className="button-secondary" href="/"><ArrowLeft size={15} /> مشاهدهٔ سایت</Link></div>
      <div className="admin-grid"><form className="admin-form" onSubmit={event => void submit(event)}>
        <h3>{editing ? "ویرایش والپیپر" : "افزودن والپیپر تازه"}</h3>
        {!editing && <p className="form-hint">والپیپر جدید به‌صورت پیش‌فرض عمومی نمی‌شود؛ آن را به صف بازبینی بفرستید یا پیش‌نویس ذخیره کنید.</p>}
        <div className="form-field"><label htmlFor="wallpaper-title">عنوان</label><input id="wallpaper-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="مثلاً: نبرد در نئون‌شهر" required /></div>
        <div className="admin-form-row"><div className="form-field"><label htmlFor="wallpaper-category">ژانر</label><select id="wallpaper-category" value={category} disabled={!categoryOptions.length} onChange={event => setCategory(event.target.value)}>{categoryOptions.length ? categoryOptions.map(item => <option key={item}>{item}</option>) : <option value="">ابتدا دسته بسازید</option>}</select>{!categoryOptions.length && <small className="form-hint">برای افزودن والپیپر، ابتدا از بخش «دسته‌ها و برچسب‌ها» یک دسته ایجاد کنید.</small>}</div><div className="form-field"><label htmlFor="wallpaper-game">نام بازی</label><input id="wallpaper-game" value={gameTitle} onChange={event => setGameTitle(event.target.value)} maxLength={160} placeholder="مثلاً Elden Ring" /></div></div>
        <div className="form-field"><label htmlFor="wallpaper-tags">برچسب‌ها (با ویرگول جدا کنید)</label><input id="wallpaper-tags" value={tags} onChange={event => setTags(event.target.value)} maxLength={1500} placeholder="نئون، شب، قهرمان، سایبرپانک" /></div>
        <div className="admin-form-row"><div className="form-field"><label htmlFor="wallpaper-mood">حال‌وهوا</label><select id="wallpaper-mood" value={mood} onChange={event => setMood(event.target.value)}>{moods.map(item => <option key={item}>{item}</option>)}</select></div><div className="form-field"><label htmlFor="wallpaper-color">رنگ غالب</label><select id="wallpaper-color" value={color} onChange={event => setColor(event.target.value)}>{colors.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div></div>
        <div className="form-field"><label htmlFor="wallpaper-device">دستگاه هدف</label><select id="wallpaper-device" value={targetDevice} onChange={event => setTargetDevice(event.target.value)}>{devices.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
        <div className="form-field"><label htmlFor="wallpaper-description">توضیحات (اختیاری)</label><textarea id="wallpaper-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={3000} placeholder="چند کلمه دربارهٔ این والپیپر..." /></div>
        <div className="form-field"><label htmlFor="wallpaper-file">تصویر باکیفیت اصلی {editing && "(برای جایگزینی انتخاب کنید)"}</label><div className="file-drop">{preview ? <img src={preview} alt="پیش‌نمایش تصویر انتخاب‌شده" style={{ width: "100%", maxHeight: 130, objectFit: "contain", marginBottom: 8 }} /> : <ImagePlus size={22} />}<input id="wallpaper-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div><small className="form-hint">PNG/JPG/WEBP تا ۱۲ مگابایت · خروجی WebP بهینه و thumbnail ساخته می‌شود</small>{dimensions.width && dimensions.height && <small className="form-hint">{dimensions.width}×{dimensions.height} · {deviceLabels[deviceForDimensions(dimensions.width,dimensions.height)]} · {formatBytes(file?.size)}</small>}</div>
        <div className="form-field"><label htmlFor="wallpaper-variants">نسخه‌های دانلودی بیشتر (اختیاری، تا ۸ فایل)</label><div className="file-drop"><ImagePlus size={20} /><input id="wallpaper-variants" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => setVariantFiles(Array.from(event.target.files ?? []).slice(0,8))} /></div><small className="form-hint">ابعاد واقعی هر نسخه خودکار تشخیص داده می‌شود؛ حداکثر ۱۲ مگابایت برای هر فایل.</small>{variantDimensions.length > 0 && <div className="variant-file-list">{variantDimensions.map(item => <span key={`${item.file.name}-${item.width}`}>{item.width}×{item.height} · {deviceLabels[item.device]} · {formatBytes(item.file.size)}</span>)}</div>}</div>
        {error && <p className="error-text" role="alert">{error}</p>}{success && <p className="success-text" role="status">{success}</p>}
        <div className="form-actions"><button className="button-primary" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : editing ? <Pencil size={15} /> : <Upload size={15} />}{busy ? "در حال بهینه‌سازی و ذخیره..." : editing ? "ذخیرهٔ تغییرات" : "ارسال به صف بازبینی"}</button>{!editing && <button className="button-secondary" type="submit" data-publication-status="draft" disabled={busy}><Pencil size={14} /> ذخیره به‌عنوان پیش‌نویس</button>}{editing && <button className="button-secondary" type="button" onClick={resetForm}><X size={14} /> لغو</button>}</div>
      </form>
      <div>
        <h3 className="admin-list-heading">والپیپرهای ثبت‌شده</h3>
        <p className="form-hint">فهرست با صفحه‌بندی بارگذاری می‌شود؛ انتخاب گروهی فقط موارد همین صفحه را دربرمی‌گیرد.</p>
        <div className="admin-wallpaper-tools">
          <input aria-label="جست‌وجو در فهرست مدیریت" value={wallpaperSearch} onChange={event => setWallpaperSearch(event.target.value)} placeholder="جست‌وجو در عنوان، بازی یا برچسب..." />
          <select aria-label="فیلتر دسته‌بندی مدیریت" value={wallpaperCategoryFilter} onChange={event => setWallpaperCategoryFilter(event.target.value)}><option value="">همهٔ دسته‌ها</option>{categoryOptions.map(item => <option key={item}>{item}</option>)}</select>
          <select aria-label="وضعیت والپیپرها" value={wallpaperStateFilter} onChange={event => setWallpaperStateFilter(event.target.value as typeof wallpaperStateFilter)}><option value="all">همهٔ وضعیت‌ها</option><option value="active">منتشرشده</option><option value="pending">منتظر بازبینی</option><option value="draft">پیش‌نویس</option><option value="archived">بایگانی‌شده</option></select>
        </div>
        {listItems.length > 0 && <label className="admin-select-page"><input className="admin-row-select" type="checkbox" aria-label="انتخاب همهٔ والپیپرهای همین صفحه" checked={allPageSelected} onChange={event => setSelectedIds(event.target.checked ? listItems.map(item => item.id) : [])} /> انتخاب همهٔ {listItems.length.toLocaleString("fa-IR")} مورد این صفحه</label>}
        {selectedIds.length > 0 && <div className="admin-bulk-toolbar" role="group" aria-label="عملیات گروهی">
          <strong>{selectedIds.length.toLocaleString("fa-IR")} مورد انتخاب‌شده</strong>
          <select aria-label="نوع عملیات گروهی" value={bulkAction} onChange={event => { setBulkAction(event.target.value); setBulkValue(""); }}><option value="setCategory">تغییر دسته</option><option value="setGameTitle">تغییر نام بازی</option><option value="setTags">جایگزینی برچسب‌ها</option><option value="archive">بایگانی</option><option value="restore">بازگردانی از بایگانی</option></select>
          {bulkAction === "setCategory" ? <select aria-label="دستهٔ مقصد" value={bulkValue} onChange={event => setBulkValue(event.target.value)}><option value="">انتخاب دستهٔ مقصد</option>{categoryOptions.map(item => <option key={item}>{item}</option>)}</select> : (bulkAction === "setGameTitle" || bulkAction === "setTags") ? <input aria-label={bulkAction === "setGameTitle" ? "نام بازی جدید" : "برچسب‌های جایگزین"} maxLength={bulkAction === "setGameTitle" ? 160 : 1500} value={bulkValue} onChange={event => setBulkValue(event.target.value)} placeholder={bulkAction === "setGameTitle" ? "نام بازی (خالی = پاک‌کردن)" : "برچسب‌ها با ویرگول جدا شوند"} /> : null}
          <button className="button-primary" type="button" disabled={bulkUpdate.isPending} onClick={() => void performBulkAction()}>{bulkUpdate.isPending ? "در حال اجرا..." : "اجرای عملیات"}</button>
          <button className="button-secondary" type="button" onClick={() => setSelectedIds([])}>لغو انتخاب</button>
        </div>}
        {bulkNotice && <p className="success-text" role="status">{bulkNotice}</p>}
        {variantNotice.error && <p className="error-text" role="alert">{variantNotice.error}</p>}{variantNotice.success && <p className="success-text" role="status">{variantNotice.success}</p>}
        {list.isLoading ? <div className="loading-line"><span className="spinner" /> در حال دریافت فهرست...</div> : list.error ? <div className="notice-box">فهرست دریافت نشد: {list.error.message}</div> : listItems.length ? <div className="admin-list">{listItems.map(item => <article className="admin-row" key={item.id}>
          <label className="admin-row-check"><input className="admin-row-select" type="checkbox" aria-label={`انتخاب ${item.title}`} checked={selectedIds.includes(item.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))} /></label>
          <img src={getResponsiveImageSource(item.thumbnailUrl || item.imageUrl, [160], { quality: 80, maxWidth: 320 }).src} alt="" />
          <div className="admin-row-main"><strong>{item.title}</strong><span>{item.gameTitle ? `${item.gameTitle} · ` : ""}{item.resolution} · {formatBytes(item.fileSize)}{item.extraVariantCount ? ` · ${item.extraVariantCount.toLocaleString("fa-IR")} نسخهٔ اضافه` : ""}{item.isArchived ? " · بایگانی‌شده" : item.publicationStatus === "pending" ? " · منتظر بازبینی" : item.publicationStatus === "draft" ? " · پیش‌نویس" : " · منتشرشده"}</span>{item.extraVariantCount > 0 && <details className="admin-variant-details"><summary>نمایش نسخه‌های دانلودی</summary><div className="admin-variant-list">{item.extraVariants.map(variant => <div key={variant.id}><span>{variant.width}×{variant.height} · {variant.resolution} · {deviceLabels[variant.targetDevice] ?? variant.targetDevice} · {formatBytes(variant.fileSize ?? 0)}</span><button className="icon-button danger" type="button" aria-label={`حذف نسخه ${variant.resolution}`} title="حذف این نسخه" disabled={deleteVariant.isPending || deleteExtraVariants.isPending} onClick={() => void removeVariant(item, variant)}><Trash2 size={14} /></button></div>)}</div></details>}</div>
          <div className="admin-row-actions"><button className="icon-button" type="button" title="ویرایش" aria-label={`ویرایش ${item.title}`} onClick={() => beginEdit(item)}><Pencil size={15} /></button>{!item.isArchived && item.publicationStatus === "draft" && <button className="icon-button" type="button" title="ارسال به صف بازبینی" aria-label={`ارسال ${item.title} به صف بازبینی`} disabled={setPublicationStatus.isPending} onClick={() => void submitDraftForReview(item)}><Upload size={15} /></button>}{item.extraVariantCount > 0 && <button className="icon-button danger" type="button" title="حذف همهٔ نسخه‌های اضافه" aria-label={`حذف نسخه‌های اضافهٔ ${item.title}`} disabled={deleteExtraVariants.isPending} onClick={() => void removeExtraVariants(item)}><Layers size={15} /></button>}{!item.isArchived && <button className="icon-button danger" type="button" title="بایگانی" aria-label={`بایگانی ${item.title}`} onClick={() => void archiveItem(item)}><Archive size={15} /></button>}<button className="icon-button danger" type="button" title="حذف دائمی از سایت و دیتابیس؛ فایل ممکن است باقی بماند" aria-label={`حذف دائمی ${item.title}`} disabled={deletePermanently.isPending} onClick={() => void permanentlyDeleteItem(item)}><Trash2 size={15} /></button></div>
        </article>)}</div> : <div className="empty-state"><div className="empty-icon"><ImagePlus size={22} /></div><h3>موردی پیدا نشد</h3><p>فیلترها را تغییر دهید یا از فرم کناری والپیپر تازه اضافه کنید.</p></div>}
        {totalWallpaperPages > 1 && <div className="admin-list-pagination"><button className="button-secondary" type="button" disabled={wallpaperPage <= 1} onClick={() => setWallpaperPage(page => page - 1)}>قبلی</button><span>صفحهٔ {wallpaperPage.toLocaleString("fa-IR")} از {totalWallpaperPages.toLocaleString("fa-IR")} · {(list.data?.total ?? 0).toLocaleString("fa-IR")} نتیجه</span><button className="button-secondary" type="button" disabled={wallpaperPage >= totalWallpaperPages} onClick={() => setWallpaperPage(page => page + 1)}>بعدی</button></div>}
        <details className="admin-duplicate-candidates" onToggle={event => setShowDuplicateCandidates(event.currentTarget.open)}><summary>نامزدهای مشابه برای بررسی دستی {duplicateCandidates.data?.length ? `(${duplicateCandidates.data.length.toLocaleString("fa-IR")})` : ""}</summary><p className="form-hint">این‌ها فقط شباهت متنی و مشخصاتی دارند و تکراری قطعی نیستند؛ هیچ موردی خودکار حذف نمی‌شود.</p>{duplicateCandidates.isLoading ? <span className="form-hint">در حال بررسی...</span> : duplicateCandidates.error ? <span className="error-text">بررسی مشابه‌ها ممکن نشد.</span> : duplicateCandidates.data?.length ? duplicateCandidates.data.map((group, index) => <div className="admin-duplicate-group" key={`candidate-${index}`}>{group.map(candidate => <div className="admin-duplicate-item" key={candidate.id}><img src={getResponsiveImageSource(candidate.thumbnailUrl || candidate.imageUrl, [160], { quality: 80, maxWidth: 320 }).src} alt="" /><span>{candidate.gameTitle ? `${candidate.gameTitle} · ` : ""}{candidate.publicationStatus === "published" ? <Link href={`/wallpapers/${candidate.id}`}>{candidate.title}</Link> : <strong>{candidate.title}</strong>}<small> · {candidate.width}×{candidate.height}{candidate.publicationStatus === "pending" ? " · در صف بررسی" : candidate.publicationStatus === "draft" ? " · پیش‌نویس" : ""}</small></span></div>)}</div>) : <span className="form-hint">نامزد مشابهی پیدا نشد.</span>}</details>
      </div>
      </div>
    </section>}
        {activeSection === "review" && canAccessSection("review") && <div id="admin-review"><AdminReviewQueue /></div>}
        {activeSection === "health" && canAccessSection("health") && <div id="admin-health"><AdminContentHealth onEdit={openHealthItem} /></div>}
        {activeSection === "requests" && canAccessSection("requests") && <section id="admin-requests" className="admin-panel request-inbox">
      <div className="admin-top"><div><h2><MessageSquareText size={18} /> درخواست‌های کاربران</h2><p>درخواست‌های متنی ثبت‌شده برای بررسی شما؛ اطلاعات تماس از کاربران دریافت نمی‌شود.</p></div><span className="request-total">{(requests.data?.total ?? 0).toLocaleString("fa-IR")} درخواست</span></div>
      {requestStatusError && <p className="error-text" role="alert">{requestStatusError}</p>}{requestDeleteError && <p className="error-text" role="alert">{requestDeleteError}</p>}
      {requests.isLoading ? <div className="loading-line"><span className="spinner" /> در حال دریافت درخواست‌ها...</div> : requests.error ? <div className="notice-box">فهرست درخواست‌ها دریافت نشد: {requests.error.message}</div> : requests.data?.items.length ? <div className="request-list">
        {requests.data.items.map(request => <article className="request-row" key={request.id}>
          <div className="request-row-heading"><div><strong>{request.gameTitle}</strong><span className="request-date">{new Date(request.createdAt).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })}</span></div><span className={`request-status status-${request.status}`}>{requestStatusLabels[request.status]}</span><button className="icon-button danger" type="button" title="حذف دائمی درخواست" disabled={deleteRequest.isPending} onClick={() => void deleteRequestItem(request.id, `${request.gameTitle} — ${request.wantedContent}`)}><Trash2 size={15} /></button></div>
          <p className="request-wanted"><b>درخواست:</b> {request.wantedContent}</p>
          <div className="request-metadata"><span>{request.targetDevice === "any" ? "دستگاه: فرقی نمی‌کند" : `دستگاه: ${deviceLabels[request.targetDevice] ?? request.targetDevice}`}</span>{request.resolution && <span>رزولوشن: {request.resolution}</span>}</div>
          {request.details && <p className="request-details">{request.details}</p>}
          <label className="request-status-control">وضعیت
            <select value={request.status} disabled={updateRequestStatus.isPending} onChange={event => void setRequestStatus(request.id, event.target.value as "new" | "reviewed" | "completed")}>
              {Object.entries(requestStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        </article>)}
        {totalRequestPages > 1 && <div className="request-pagination"><button className="button-secondary" type="button" disabled={requestPage <= 1} onClick={() => setRequestPage(page => page - 1)}>قبلی</button><span>صفحهٔ {requestPage.toLocaleString("fa-IR")} از {totalRequestPages.toLocaleString("fa-IR")}</span><button className="button-secondary" type="button" disabled={requestPage >= totalRequestPages} onClick={() => setRequestPage(page => page + 1)}>بعدی</button></div>}
      </div> : <div className="empty-state"><div className="empty-icon"><MessageSquareText size={22} /></div><h3>هنوز درخواستی ثبت نشده</h3><p>درخواست‌های بازدیدکنندگان از بخش «درخواست والپیپر» اینجا نمایش داده می‌شوند.</p></div>}
    </section>}
        {activeSection === "reports" && canAccessSection("reports") && <div id="admin-reports"><AdminIssueReports /></div>}
        {activeSection === "taxonomy" && canAccessSection("taxonomy") && <div id="admin-taxonomy"><AdminTaxonomyPanel /></div>}
        {activeSection === "settings" && canAccessSection("settings") && <div id="admin-settings"><AdminSettingsPanel /></div>}
        {activeSection === "admins" && isOwner && <div id="admin-managers"><AdminAccountsPanel /></div>}
        {activeSection === "users" && canAccessSection("users") && <div id="admin-users"><AdminUsersPanel isOwner={isOwner} /></div>}
      </div>
    </div>
  </main>;
}
