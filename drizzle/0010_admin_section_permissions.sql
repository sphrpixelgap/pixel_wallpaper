ALTER TABLE `admin_accounts` ADD `canAccessOverview` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_accounts` ADD `canAccessWallpapers` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_accounts` ADD `canAccessRequests` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_accounts` ADD `canAccessTaxonomy` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_accounts` ADD `canAccessSettings` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `admin_accounts` ADD `canAccessUsers` boolean DEFAULT false NOT NULL;