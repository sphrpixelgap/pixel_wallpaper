CREATE TABLE `site_settings` (
	`id` int NOT NULL,
	`brandName` varchar(100) NOT NULL,
	`brandCaption` varchar(120) NOT NULL,
	`footerTagline` varchar(180) NOT NULL,
	`logoUrl` varchar(1024) NOT NULL,
	`accentColor` varchar(7) NOT NULL,
	`heroEyebrow` varchar(120) NOT NULL,
	`heroTitle` varchar(100) NOT NULL,
	`heroAccentTitle` varchar(100) NOT NULL,
	`heroSubtitle` varchar(500) NOT NULL,
	`seoTitle` varchar(180) NOT NULL,
	`seoDescription` varchar(320) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallpaper_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallpaper_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallpaper_categories_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','blocked') NOT NULL DEFAULT 'user';

--> statement-breakpoint
INSERT IGNORE INTO `wallpaper_categories` (`name`, `sortOrder`) VALUES
  ('اکشن', 0), ('ماجراجویی', 0), ('فانتزی', 0), ('سایبرپانک', 0),
  ('RPG', 0), ('FPS', 0), ('استراتژی', 0), ('سایر', 0);
--> statement-breakpoint
INSERT IGNORE INTO `wallpaper_categories` (`name`, `sortOrder`)
SELECT DISTINCT `category`, 0 FROM `wallpapers` WHERE TRIM(`category`) <> '';
--> statement-breakpoint
INSERT INTO `site_settings` (`id`, `brandName`, `brandCaption`, `footerTagline`, `logoUrl`, `accentColor`, `heroEyebrow`, `heroTitle`, `heroAccentTitle`, `heroSubtitle`, `seoTitle`, `seoDescription`)
VALUES (1, 'پیکسل', 'والپیپر گیمینگ', 'برای هر فریم، یک دنیای تازه.', 'https://files.manuscdn.com/user_upload_by_module/session_file/310519664055778542/BvOcnZWtyFfXPqMt.png', '#a36bff', 'دنیای تصویرهای گیمینگ', 'بازی‌ها را', 'به صفحه‌ات بیاور.', 'والپیپرهای گیمینگ باکیفیت، برای دسکتاپی که حال‌وهوای بازی محبوبت را زندگی می‌کند. کشف کن، ذخیره کن و با وضوح دلخواه دانلود کن.', 'پیکسل والپیپر | دانلود والپیپر گیمینگ', 'والپیپرهای گیمینگ باکیفیت را برای دسکتاپ، موبایل و اولتراواید در پیکسل والپیپر پیدا و دانلود کنید.')
ON DUPLICATE KEY UPDATE `id` = `id`;
