CREATE TABLE `api_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`month_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_usage_sku_month` ON `api_usage` (`sku`,`month_key`);--> statement-breakpoint
CREATE TABLE `cities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`uf` text NOT NULL,
	`low_lat` real,
	`low_lng` real,
	`high_lat` real,
	`high_lng` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cities_name_uf` ON `cities` (`name`,`uf`);--> statement-breakpoint
CREATE TABLE `place_searches` (
	`place_id` text NOT NULL,
	`search_id` integer NOT NULL,
	PRIMARY KEY(`place_id`, `search_id`),
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`search_id`) REFERENCES `searches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `places` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`lat` real,
	`lng` real,
	`primary_type` text,
	`types` text NOT NULL,
	`business_status` text,
	`maps_uri` text,
	`phone` text,
	`intl_phone` text,
	`website` text,
	`rating` real,
	`rating_count` integer,
	`city_id` integer NOT NULL,
	`site_status` text DEFAULT 'pending' NOT NULL,
	`emails` text DEFAULT '[]' NOT NULL,
	`instagram` text,
	`whatsapp` text,
	`whatsapp_source` text,
	`meta_pixel` integer DEFAULT false NOT NULL,
	`google_ads` integer DEFAULT false NOT NULL,
	`gtm` integer DEFAULT false NOT NULL,
	`enriched_at` integer,
	`score` integer DEFAULT 0 NOT NULL,
	`signals` text DEFAULT '[]' NOT NULL,
	`opt_out` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `searches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`city_id` integer NOT NULL,
	`segment_id` integer NOT NULL,
	`status` text NOT NULL,
	`requests_used` integer DEFAULT 0 NOT NULL,
	`places_found` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `segments_name_unique` ON `segments` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
