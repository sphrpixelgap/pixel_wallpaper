CREATE TABLE `imagekit_cleanup_jobs` (
	`fileId` varchar(128) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `imagekit_cleanup_jobs_fileId` PRIMARY KEY(`fileId`)
);
--> statement-breakpoint
CREATE INDEX `imagekit_cleanup_next_attempt_idx` ON `imagekit_cleanup_jobs` (`nextAttemptAt`);