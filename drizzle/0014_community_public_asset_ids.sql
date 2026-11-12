ALTER TABLE `community_wallpaper_submissions` ADD `publicImageFileId` varchar(128);--> statement-breakpoint
ALTER TABLE `community_wallpaper_submissions` ADD `publicThumbnailFileId` varchar(128);--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `imageFileId` varchar(128);--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `thumbnailFileId` varchar(128);