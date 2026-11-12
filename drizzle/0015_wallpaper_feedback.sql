CREATE TABLE `wallpaper_likes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wallpaperId` int NOT NULL,
	`clientHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wallpaper_likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `wallpaper_likes_wallpaper_client_uq` UNIQUE(`wallpaperId`,`clientHash`)
);
--> statement-breakpoint
ALTER TABLE `wallpaper_issue_reports` MODIFY COLUMN `reason` enum('download','quality','wrong_info','duplicate','broken','irrelevant','other') NOT NULL;--> statement-breakpoint
ALTER TABLE `client_request_limits` ADD `likeWindowStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `client_request_limits` ADD `likeAttemptCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `wallpaper_likes_wallpaper_created_idx` ON `wallpaper_likes` (`wallpaperId`,`createdAt`);