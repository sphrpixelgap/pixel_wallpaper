CREATE TABLE `wallpaper_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wallpaperId` int NOT NULL,
	`resolution` varchar(40) NOT NULL,
	`width` int NOT NULL,
	`height` int NOT NULL,
	`targetDevice` varchar(24) NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`imageUrl` varchar(1024) NOT NULL,
	`imageMime` varchar(40) NOT NULL,
	`fileSize` int NOT NULL DEFAULT 0,
	`downloadCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallpaper_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `gameTitle` varchar(160);--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `mood` varchar(40) DEFAULT 'سایر' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `dominantColor` varchar(24) DEFAULT 'purple' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `targetDevice` varchar(24) DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `imageMime` varchar(40) DEFAULT 'image/jpeg' NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `fileSize` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `thumbnailKey` varchar(512);--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `thumbnailUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `wallpaper_variants` ADD CONSTRAINT `wallpaper_variants_wallpaperId_wallpapers_id_fk` FOREIGN KEY (`wallpaperId`) REFERENCES `wallpapers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `wallpaper_variants_wallpaper_idx` ON `wallpaper_variants` (`wallpaperId`);--> statement-breakpoint
CREATE INDEX `wallpapers_game_title_idx` ON `wallpapers` (`gameTitle`);--> statement-breakpoint
CREATE INDEX `wallpapers_popular_idx` ON `wallpapers` (`downloadCount`);
--> statement-breakpoint
INSERT INTO `wallpaper_variants` (`wallpaperId`, `resolution`, `width`, `height`, `targetDevice`, `imageKey`, `imageUrl`, `imageMime`, `fileSize`, `downloadCount`)
SELECT `id`, `resolution`, COALESCE(`width`, 1920), COALESCE(`height`, 1080),
  CASE
    WHEN `width` IS NOT NULL AND `height` IS NOT NULL AND `width` / `height` > 2.05 THEN 'ultrawide'
    WHEN `width` IS NOT NULL AND `height` IS NOT NULL AND `width` / `height` < 0.82 THEN 'mobile'
    ELSE `targetDevice`
  END,
  `imageKey`, `imageUrl`, `imageMime`, `fileSize`, `downloadCount`
FROM `wallpapers`;
