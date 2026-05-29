CREATE TABLE `beaches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`latitude` integer,
	`longitude` integer,
	`community_risk_level` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beaches_slug_unique` ON `beaches` (`slug`);--> statement-breakpoint
CREATE TABLE `bmkg_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`beach_id` integer,
	`weather` text,
	`wave_forecast` text,
	`warning` text,
	`fetched_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`beach_id`) REFERENCES `beaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `xgboost_predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`beach_id` integer,
	`risk_level` integer NOT NULL,
	`risk_label` text NOT NULL,
	`confidence` real,
	`source` text NOT NULL,
	`threshold_label` integer,
	`model_agrees` integer,
	`feature_importance` text,
	`raw_features` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`beach_id`) REFERENCES `beaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reassurance_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prediction_id` integer,
	`report_id` text,
	`shap_risk` text,
	`bmkg_risk` text,
	`agreed` integer,
	`final_level` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reassurance_results_report_id_unique` ON `reassurance_results` (`report_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`beach_id` integer,
	`reporter_id` text,
	`source` text NOT NULL,
	`natural_signs` text NOT NULL,
	`raw_body` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`beach_id`) REFERENCES `beaches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shap_predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_id` text,
	`risk_level` text NOT NULL,
	`community_characteristics` text,
	`validated_signs` text,
	`actions` text,
	`raw_response` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON UPDATE no action ON DELETE no action
);
