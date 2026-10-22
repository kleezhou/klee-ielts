CREATE TABLE `checkin_status` (
 `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
 `day` text NOT NULL,
 `checked_in` integer NOT NULL,
 `source_revision` integer NOT NULL,
 `source_updated_at` text,
 `received_at` text NOT NULL
);
