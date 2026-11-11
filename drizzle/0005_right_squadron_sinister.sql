ALTER TABLE `wallpaper_requests` ADD `trackingCode` varchar(32) NULL;--> statement-breakpoint
UPDATE `wallpaper_requests` SET `trackingCode` = LOWER(REPLACE(UUID(), '-', '')) WHERE `trackingCode` IS NULL;--> statement-breakpoint
ALTER TABLE `wallpaper_requests` MODIFY `trackingCode` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpaper_requests` ADD CONSTRAINT `wallpaper_requests_tracking_code_uq` UNIQUE(`trackingCode`);
