CREATE TABLE `client_request_limits` (
	`clientHash` varchar(64) NOT NULL,
	`lastAiCheckAt` timestamp,
	`lastSubmittedAt` timestamp,
	`checkLockToken` varchar(32),
	`checkLockExpiresAt` timestamp,
	`lookupWindowStartedAt` timestamp,
	`lookupAttemptCount` int NOT NULL DEFAULT 0,
	`viewWindowStartedAt` timestamp,
	`viewAttemptCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_request_limits_clientHash` PRIMARY KEY(`clientHash`)
);
--> statement-breakpoint
CREATE INDEX `client_request_limits_updated_at_idx` ON `client_request_limits` (`updatedAt`);