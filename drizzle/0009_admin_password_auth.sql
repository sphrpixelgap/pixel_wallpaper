CREATE TABLE `admin_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(32) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('owner','admin') NOT NULL DEFAULT 'admin',
	`isActive` int NOT NULL DEFAULT 1,
	`mustChangePassword` int NOT NULL DEFAULT 0,
	`ownerSlot` int,
	`ownerOpenId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastLoginAt` timestamp,
	CONSTRAINT `admin_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_accounts_username_uq` UNIQUE(`username`),
	CONSTRAINT `admin_accounts_owner_slot_uq` UNIQUE(`ownerSlot`),
	CONSTRAINT `admin_accounts_owner_open_id_uq` UNIQUE(`ownerOpenId`)
);
--> statement-breakpoint
CREATE TABLE `admin_auth_limits` (
	`bucketHash` varchar(64) NOT NULL,
	`windowStartedAt` timestamp NOT NULL,
	`attemptCount` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `admin_auth_limits_bucketHash` PRIMARY KEY(`bucketHash`)
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`tokenHash` varchar(64) NOT NULL,
	`accountId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`isRecovery` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_sessions_tokenHash` PRIMARY KEY(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_accountId_admin_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `admin_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_auth_limits_updated_at_idx` ON `admin_auth_limits` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `admin_sessions_account_idx` ON `admin_sessions` (`accountId`);--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expiresAt`);