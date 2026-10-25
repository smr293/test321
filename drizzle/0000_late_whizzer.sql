CREATE TABLE `announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`audience` text DEFAULT 'all' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `announcements_org_idx` ON `announcements` (`org_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text NOT NULL,
	`session_id` text,
	`method` text DEFAULT 'self' NOT NULL,
	`checked_in_at` integer NOT NULL,
	`checked_in_by_id` text,
	`nonce` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_session_member_uq` ON `attendance` (`session_id`,`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_nonce_uq` ON `attendance` (`nonce`);--> statement-breakpoint
CREATE INDEX `attendance_org_time_idx` ON `attendance` (`org_id`,`checked_in_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`actor_id` text,
	`actor_name` text,
	`actor_role` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`outcome` text DEFAULT 'success' NOT NULL,
	`meta` text,
	`ip` text,
	`prev_hash` text,
	`hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_org_idx` ON `audit_logs` (`org_id`);--> statement-breakpoint
CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'stripe' NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`status` text DEFAULT 'received' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`processed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_events_provider_event_uq` ON `billing_events` (`provider`,`event_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`session_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`position` integer,
	`created_at` integer NOT NULL,
	`cancelled_at` integer,
	`checked_in_at` integer,
	`check_in_method` text,
	`source` text DEFAULT 'app' NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `class_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_session_member_uq` ON `bookings` (`session_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `bookings_member_idx` ON `bookings` (`member_id`);--> statement-breakpoint
CREATE INDEX `bookings_org_idx` ON `bookings` (`org_id`);--> statement-breakpoint
CREATE TABLE `class_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`class_id` text NOT NULL,
	`location_id` text,
	`coach_member_id` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`capacity` integer DEFAULT 20 NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `gym_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `class_sessions_org_starts_idx` ON `class_sessions` (`org_id`,`starts_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `class_sessions_class_start_uq` ON `class_sessions` (`class_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`location_id` text,
	`name` text NOT NULL,
	`discipline` text DEFAULT 'MMA' NOT NULL,
	`description` text,
	`coach_member_id` text,
	`capacity` integer DEFAULT 20 NOT NULL,
	`duration_minutes` integer DEFAULT 60 NOT NULL,
	`level` text DEFAULT 'all' NOT NULL,
	`eligible_plan_ids` text,
	`booking_window_days` integer DEFAULT 14 NOT NULL,
	`cancellation_window_hours` integer DEFAULT 4 NOT NULL,
	`recurrence` text,
	`color` text DEFAULT '#B8F36B' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `gym_locations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`coach_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `classes_org_idx` ON `classes` (`org_id`);--> statement-breakpoint
CREATE TABLE `coach_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`coach_member_id` text NOT NULL,
	`fighter_member_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`focus` text,
	`assigned_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coach_assignments_uq` ON `coach_assignments` (`coach_member_id`,`fighter_member_id`);--> statement-breakpoint
CREATE INDEX `coach_assignments_fighter_idx` ON `coach_assignments` (`fighter_member_id`);--> statement-breakpoint
CREATE INDEX `coach_assignments_org_idx` ON `coach_assignments` (`org_id`);--> statement-breakpoint
CREATE TABLE `coach_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`coach_member_id` text NOT NULL,
	`fighter_member_id` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'staff' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `coach_notes_fighter_idx` ON `coach_notes` (`fighter_member_id`);--> statement-breakpoint
CREATE TABLE `consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text,
	`type` text NOT NULL,
	`granted` integer DEFAULT false NOT NULL,
	`version` text DEFAULT '1.0' NOT NULL,
	`granted_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `data_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`handled_by_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text,
	`name` text NOT NULL,
	`kind` text DEFAULT 'document' NOT NULL,
	`url` text,
	`mime_type` text,
	`size_bytes` integer,
	`signed_at` integer,
	`uploaded_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`template` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`org_ids` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fight_camps` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`fighter_member_id` text NOT NULL,
	`coach_member_id` text,
	`title` text NOT NULL,
	`opponent` text,
	`event_name` text,
	`fight_date` integer NOT NULL,
	`weight_class` text,
	`camp_start` integer NOT NULL,
	`phases` text,
	`weekly_targets` text,
	`checklist` text,
	`coach_notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fight_camps_fighter_idx` ON `fight_camps` (`fighter_member_id`);--> statement-breakpoint
CREATE TABLE `fight_records` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`fighter_member_id` text NOT NULL,
	`result` text NOT NULL,
	`method` text,
	`opponent` text NOT NULL,
	`event_name` text,
	`fight_date` integer NOT NULL,
	`weight_class` text,
	`rounds` integer,
	`round_ended` integer,
	`level` text DEFAULT 'amateur' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`verified_by_id` text,
	`verified_at` integer,
	`notes` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fight_records_fighter_idx` ON `fight_records` (`fighter_member_id`);--> statement-breakpoint
CREATE TABLE `fighter_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`target` text,
	`progress` integer DEFAULT 0 NOT NULL,
	`due_date` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fighter_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text NOT NULL,
	`nickname` text,
	`discipline` text,
	`level` text DEFAULT 'beginner' NOT NULL,
	`weight_class` text,
	`current_weight_kg` real,
	`target_weight_kg` real,
	`height_cm` integer,
	`stance` text,
	`goals` text,
	`is_minor` integer DEFAULT false NOT NULL,
	`guardian_name` text,
	`guardian_phone` text,
	`public_profile` integer DEFAULT false NOT NULL,
	`public_consent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fighter_profiles_member_uq` ON `fighter_profiles` (`member_id`);--> statement-breakpoint
CREATE INDEX `fighter_profiles_org_idx` ON `fighter_profiles` (`org_id`);--> statement-breakpoint
CREATE TABLE `gym_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text,
	`timezone` text DEFAULT 'Europe/Stockholm' NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_locations_org_idx` ON `gym_locations` (`org_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`result` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idempotency_scope_idx` ON `idempotency_keys` (`scope`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`invited_by_id` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_uq` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `invitations_org_idx` ON `invitations` (`org_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subscription_id` text,
	`member_id` text NOT NULL,
	`number` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`period_start` integer,
	`period_end` integer,
	`due_date` integer,
	`paid_at` integer,
	`provider` text DEFAULT 'sandbox' NOT NULL,
	`provider_invoice_id` text,
	`description` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_uq` ON `invoices` (`number`);--> statement-breakpoint
CREATE INDEX `invoices_org_status_idx` ON `invoices` (`org_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_provider_uq` ON `invoices` (`provider`,`provider_invoice_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`success` integer DEFAULT false NOT NULL,
	`ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_ident_idx` ON `login_attempts` (`identifier`,`created_at`);--> statement-breakpoint
CREATE TABLE `membership_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_credits_sub_idx` ON `membership_credits` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `membership_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`actor_id` text,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_events_sub_idx` ON `membership_events` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `membership_pauses` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`start_date` integer NOT NULL,
	`end_date` integer NOT NULL,
	`reason` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_pauses_sub_idx` ON `membership_pauses` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `membership_plan_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`from_plan_id` text,
	`to_plan_id` text NOT NULL,
	`effective_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `membership_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'unlimited' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`interval` text DEFAULT 'month' NOT NULL,
	`class_limit_per_week` integer,
	`credit_count` integer,
	`allowed_disciplines` text,
	`location_ids` text,
	`signup_fee_cents` integer DEFAULT 0 NOT NULL,
	`trial_days` integer DEFAULT 0 NOT NULL,
	`min_commitment_months` integer DEFAULT 0 NOT NULL,
	`notice_period_days` integer DEFAULT 0 NOT NULL,
	`freeze_allowed` integer DEFAULT true NOT NULL,
	`freeze_max_days` integer DEFAULT 60 NOT NULL,
	`auto_renew` integer DEFAULT true NOT NULL,
	`tax_rate_bps` integer,
	`family_discount_bps` integer DEFAULT 0 NOT NULL,
	`student_discount_bps` integer DEFAULT 0 NOT NULL,
	`intro_offer_cents` integer,
	`intro_offer_months` integer,
	`cancellation_policy` text,
	`terms` text,
	`is_active` integer DEFAULT true NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `membership_plans_org_idx` ON `membership_plans` (`org_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`body` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_pair_idx` ON `messages` (`sender_id`,`recipient_id`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`class_reminders` integer DEFAULT true NOT NULL,
	`membership_reminders` integer DEFAULT true NOT NULL,
	`payment_notifications` integer DEFAULT true NOT NULL,
	`fight_camp_reminders` integer DEFAULT true NOT NULL,
	`announcements` integer DEFAULT true NOT NULL,
	`product_updates` integer DEFAULT false NOT NULL,
	`email_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`read_at` integer,
	`dedupe_key` text,
	`email_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_uq` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `org_members` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`location_id` text,
	`title` text,
	`permissions` text,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer,
	`archived_at` integer,
	`invited_by_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `gym_locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_members_org_user_uq` ON `org_members` (`org_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `org_members_user_idx` ON `org_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `org_members_org_role_idx` ON `org_members` (`org_id`,`role`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`country` text DEFAULT 'SE' NOT NULL,
	`timezone` text DEFAULT 'Europe/Stockholm' NOT NULL,
	`tax_rate_bps` integer DEFAULT 2500 NOT NULL,
	`brand_color` text DEFAULT '#B8F36B' NOT NULL,
	`logo_url` text,
	`contact_email` text,
	`contact_phone` text,
	`website` text,
	`description` text,
	`onboarding_step` integer DEFAULT 0 NOT NULL,
	`onboarded_at` integer,
	`suspended_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_uq` ON `organizations` (`slug`);--> statement-breakpoint
CREATE INDEX `organizations_status_idx` ON `organizations` (`status`);--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`invoice_id` text,
	`member_id` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text DEFAULT 'sandbox' NOT NULL,
	`provider_payment_id` text,
	`method` text,
	`failure_reason` text,
	`processed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_org_created_idx` ON `payments` (`org_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_provider_uq` ON `payments` (`provider`,`provider_payment_id`);--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `program_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`program_id` text NOT NULL,
	`fighter_member_id` text NOT NULL,
	`assigned_by_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`progress_pct` integer DEFAULT 0 NOT NULL,
	`due_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`program_id`) REFERENCES `training_programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fighter_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `readiness_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`camp_id` text,
	`member_id` text NOT NULL,
	`date` integer NOT NULL,
	`sleep` integer,
	`soreness` integer,
	`energy` integer,
	`mood` integer,
	`weight_kg` real,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`camp_id`) REFERENCES `fight_camps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `readiness_member_idx` ON `readiness_checkins` (`member_id`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`provider_refund_id` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `saas_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`price_monthly_cents` integer DEFAULT 0 NOT NULL,
	`price_annual_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`max_locations` integer DEFAULT 1 NOT NULL,
	`max_active_members` integer DEFAULT 100 NOT NULL,
	`max_coaches` integer DEFAULT 3 NOT NULL,
	`features` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saas_plans_slug_uq` ON `saas_plans` (`slug`);--> statement-breakpoint
CREATE TABLE `saas_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'trialing' NOT NULL,
	`seats` integer DEFAULT 1 NOT NULL,
	`provider` text DEFAULT 'sandbox' NOT NULL,
	`provider_subscription_id` text,
	`trial_ends_at` integer,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `saas_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `saas_subscriptions_org_uq` ON `saas_subscriptions` (`org_id`);--> statement-breakpoint
CREATE TABLE `schema_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schema_meta_idx` ON `schema_meta` (`key`);--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`detail` text,
	`ip` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `security_events_user_idx` ON `security_events` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'SEK' NOT NULL,
	`discount_bps` integer DEFAULT 0 NOT NULL,
	`start_date` integer NOT NULL,
	`current_period_start` integer NOT NULL,
	`current_period_end` integer NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`cancel_requested_at` integer,
	`cancelled_at` integer,
	`paused_at` integer,
	`resume_at` integer,
	`ended_at` integer,
	`credits_remaining` integer,
	`auto_renew` integer DEFAULT true NOT NULL,
	`provider` text DEFAULT 'sandbox' NOT NULL,
	`provider_subscription_id` text,
	`payment_method_label` text,
	`status_reason` text,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_member_idx` ON `subscriptions` (`member_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_org_status_idx` ON `subscriptions` (`org_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_provider_uq` ON `subscriptions` (`provider`,`provider_subscription_id`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text,
	`user_id` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`response` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `training_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`coach_member_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`discipline` text,
	`weeks` integer DEFAULT 4 NOT NULL,
	`sessions_per_week` integer DEFAULT 3 NOT NULL,
	`plan` text,
	`is_template` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`member_id` text NOT NULL,
	`type` text NOT NULL,
	`date` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`intensity` text DEFAULT 'moderate' NOT NULL,
	`rpe` integer,
	`notes` text,
	`exercises` text,
	`class_session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `org_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `training_sessions_member_date_idx` ON `training_sessions` (`member_id`,`date`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`phone` text,
	`date_of_birth` integer,
	`avatar_url` text,
	`emergency_contact_name` text,
	`emergency_contact_phone` text,
	`address` text,
	`is_super_admin` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`mfa_enabled` integer DEFAULT false NOT NULL,
	`mfa_secret` text,
	`failed_login_count` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`last_login_at` integer,
	`locale` text DEFAULT 'en' NOT NULL,
	`theme` text DEFAULT 'dark' NOT NULL,
	`marketing_opt_in` integer DEFAULT false NOT NULL,
	`terms_accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workout_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`training_session_id` text NOT NULL,
	`exercise` text NOT NULL,
	`sets` integer,
	`reps` integer,
	`weight_kg` real,
	`rest_seconds` integer,
	`rpe` integer,
	`is_personal_record` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`training_session_id`) REFERENCES `training_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
