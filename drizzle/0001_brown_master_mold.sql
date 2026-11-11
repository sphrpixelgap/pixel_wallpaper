CREATE TABLE `wallpapers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`category` varchar(80) NOT NULL,
	`resolution` varchar(40) NOT NULL,
	`width` int,
	`height` int,
	`description` text,
	`imageKey` varchar(512) NOT NULL,
	`imageUrl` varchar(1024) NOT NULL,
	`downloadCount` int NOT NULL DEFAULT 0,
	`isArchived` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wallpapers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `wallpapers_archived_created_idx` ON `wallpapers` (`isArchived`,`createdAt`);