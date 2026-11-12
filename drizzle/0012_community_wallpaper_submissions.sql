CREATE TABLE `community_wallpaper_submissions` (
	`wallpaperId` int NOT NULL,
	`privateImageFileId` varchar(128),
	`privateThumbnailFileId` varchar(128),
	`sourceUrl` varchar(1024),
	`rightsConfirmedAt` timestamp NOT NULL,
	`promotedAt` timestamp,
	CONSTRAINT `community_wallpaper_submissions_wallpaperId` PRIMARY KEY(`wallpaperId`)
);
--> statement-breakpoint
ALTER TABLE `community_wallpaper_submissions` ADD CONSTRAINT `community_wallpaper_submissions_wallpaperId_wallpapers_id_fk` FOREIGN KEY (`wallpaperId`) REFERENCES `wallpapers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `community_wallpaper_submissions_promoted_idx` ON `community_wallpaper_submissions` (`promotedAt`);