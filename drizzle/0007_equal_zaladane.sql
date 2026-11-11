ALTER TABLE `wallpapers` ADD `viewCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `wallpapers_view_count_idx` ON `wallpapers` (`viewCount`);