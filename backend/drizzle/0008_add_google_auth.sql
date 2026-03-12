-- Make passwordHash nullable for Google-only users
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- However, since we're just removing NOT NULL, we can work around this:
-- SQLite actually doesn't enforce NOT NULL on ALTER TABLE ADD COLUMN,
-- and existing columns can't be altered. We'll use the pragma approach.

-- Step 1: Create new table with updated schema
CREATE TABLE `users_new` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `password_hash` text,
  `google_id` text,
  `role` text DEFAULT 'user' NOT NULL,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint

-- Step 2: Copy data from old table
INSERT INTO `users_new` (`id`, `email`, `password_hash`, `role`, `created_at`)
SELECT `id`, `email`, `password_hash`, `role`, `created_at` FROM `users`;
--> statement-breakpoint

-- Step 3: Drop old table
DROP TABLE `users`;
--> statement-breakpoint

-- Step 4: Rename new table
ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint

-- Step 5: Recreate indexes
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);
