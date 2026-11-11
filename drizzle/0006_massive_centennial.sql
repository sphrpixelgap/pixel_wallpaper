UPDATE `wallpaper_requests` SET `trackingCode` = LOWER(HEX(RANDOM_BYTES(16))) WHERE `trackingCode` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpaper_requests` MODIFY COLUMN `trackingCode` varchar(32) NULL;
