CREATE TABLE `admin_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorAccountId` int NOT NULL,
	`actorUsername` varchar(32) NOT NULL,
	`section` enum('wallpapers','requests','taxonomy','settings','users','admins') NOT NULL,
	`actionKey` varchar(128) NOT NULL,
	`entityId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wallpaper_issue_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wallpaperId` int NOT NULL,
	`wallpaperTitle` varchar(180) NOT NULL,
	`reason` enum('download','quality','wrong_info','duplicate','other') NOT NULL,
	`details` varchar(800),
	`status` enum('new','reviewed','resolved','dismissed') NOT NULL DEFAULT 'new',
	`clientHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallpaper_issue_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `client_request_limits` ADD `reportWindowStartedAt` timestamp;--> statement-breakpoint
ALTER TABLE `client_request_limits` ADD `reportAttemptCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `wallpapers` ADD `publicationStatus` enum('draft','pending','published') DEFAULT 'published' NOT NULL;--> statement-breakpoint
CREATE INDEX `admin_activity_logs_created_idx` ON `admin_activity_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_activity_logs_section_created_idx` ON `admin_activity_logs` (`section`,`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_activity_logs_actor_created_idx` ON `admin_activity_logs` (`actorAccountId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `wallpaper_issue_reports_status_created_idx` ON `wallpaper_issue_reports` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `wallpaper_issue_reports_wallpaper_created_idx` ON `wallpaper_issue_reports` (`wallpaperId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `wallpaper_issue_reports_client_created_idx` ON `wallpaper_issue_reports` (`clientHash`,`createdAt`);