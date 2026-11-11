export type CollectionFilters = {
  category?: string;
  targetDevice?: "desktop" | "mobile" | "ultrawide";
  resolution?: string;
  dominantColor?: "purple" | "blue" | "red" | "green" | "orange" | "mono";
};

export type WallpaperCollection = {
  slug: string;
  title: string;
  description: string;
  filters: CollectionFilters;
  accent: string;
};

export const collections = [
  { slug: "action", title: "ضرب‌آهنگ اکشن", description: "لحظه‌های پرانرژی، نبردهای نفس‌گیر و قهرمانانی که آمادهٔ حرکت‌اند.", filters: { category: "اکشن" }, accent: "#ff795f" },
  { slug: "adventure", title: "سفر به ماجراجویی", description: "منظره‌ها و دنیاهای خیال‌انگیز برای شروع یک سفر تازه.", filters: { category: "ماجراجویی" }, accent: "#8ddeae" },
  { slug: "cyberpunk", title: "نورهای سایبرپانک", description: "شهرهای آینده، نئون‌های درخشان و حال‌وهوای تکنولوژیک.", filters: { category: "سایبرپانک" }, accent: "#d285ff" },
  { slug: "mobile", title: "قابِ همراه", description: "تصویرهایی متناسب با صفحهٔ موبایل؛ همیشه همراهت.", filters: { targetDevice: "mobile" }, accent: "#75c7ff" },
  { slug: "4k", title: "جزئیات 4K", description: "والپیپرهای وضوح بالا برای نمایش جزئیات هر دنیا.", filters: { resolution: "4K" }, accent: "#f7ca70" },
  { slug: "purple", title: "رویاهای بنفش", description: "ترکیب‌های بنفش و بنفش‌فام برای فضایی خیال‌انگیز.", filters: { dominantColor: "purple" }, accent: "#bd8aff" },
  { slug: "ultrawide", title: "افق‌های عریض", description: "تصویرهای مناسب نمایشگرهای فوق‌عریض و میزکارهای گسترده.", filters: { targetDevice: "ultrawide" }, accent: "#67d8cd" },
] satisfies readonly WallpaperCollection[];

export function getCollection(slug: string) {
  return collections.find(collection => collection.slug === slug);
}
