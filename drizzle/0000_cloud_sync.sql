CREATE TABLE `study_sync` (
 `user_id` text PRIMARY KEY NOT NULL,
 `revision` integer NOT NULL,
 `state_json` text NOT NULL,
 `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_backups` (
 `user_id` text NOT NULL,
 `device_id` text NOT NULL,
 `state_json` text NOT NULL,
 `created_at` text NOT NULL,
 PRIMARY KEY (`user_id`, `device_id`)
);
