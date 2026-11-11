CREATE TABLE `wallpaper_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameTitle` varchar(160) NOT NULL,
	`wantedContent` varchar(200) NOT NULL,
	`targetDevice` varchar(24) NOT NULL DEFAULT 'desktop',
	`resolution` varchar(40),
	`details` text,
	`status` enum('new','reviewed','completed') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallpaper_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `wallpaper_requests_status_created_idx` ON `wallpaper_requests` (`status`,`createdAt`);