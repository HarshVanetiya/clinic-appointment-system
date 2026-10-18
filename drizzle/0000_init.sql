CREATE TYPE "public"."booking_source" AS ENUM('online', 'phone', 'walk_in');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'completed', 'no_show', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_kind" AS ENUM('confirmation', 'reminder', 'cancellation', 'reschedule', 'therapist_new', 'therapist_cancelled', 'therapist_rescheduled');--> statement-breakpoint
CREATE TYPE "public"."override_kind" AS ENUM('closed', 'time_off', 'extra_hours');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'therapist');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid,
	"date" date NOT NULL,
	"kind" "override_kind" NOT NULL,
	"start_time" time,
	"end_time" time,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overrides_times" CHECK (("availability_overrides"."start_time" is null and "availability_overrides"."end_time" is null) or ("availability_overrides"."start_time" is not null and "availability_overrides"."end_time" is not null and "availability_overrides"."end_time" > "availability_overrides"."start_time")),
	CONSTRAINT "overrides_extra_needs_times" CHECK ("availability_overrides"."kind" <> 'extra_hours' or "availability_overrides"."start_time" is not null)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"service_id" uuid NOT NULL,
	"therapist_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"source" "booking_source" DEFAULT 'online' NOT NULL,
	"patient_name" text NOT NULL,
	"patient_email" text NOT NULL,
	"patient_phone" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"price_paise" integer NOT NULL,
	"duration_min" smallint NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bookings_order" CHECK ("bookings"."ends_at" > "bookings"."starts_at" and "bookings"."blocked_until" >= "bookings"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "clinic_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"address_line" text NOT NULL,
	"slot_interval_min" smallint DEFAULT 15 NOT NULL,
	"min_notice_min" integer DEFAULT 120 NOT NULL,
	"booking_window_days" smallint DEFAULT 56 NOT NULL,
	"cancellation_cutoff_hours" smallint DEFAULT 24 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_settings_singleton" CHECK ("clinic_settings"."id" = 1),
	CONSTRAINT "clinic_settings_interval" CHECK ("clinic_settings"."slot_interval_min" between 5 and 60)
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"kind" "email_kind" NOT NULL,
	"to" text NOT NULL,
	"provider_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"duration_min" smallint NOT NULL,
	"buffer_after_min" smallint DEFAULT 0 NOT NULL,
	"price_paise" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug"),
	CONSTRAINT "services_duration" CHECK ("services"."duration_min" between 5 and 480),
	CONSTRAINT "services_buffer" CHECK ("services"."buffer_after_min" between 0 and 120),
	CONSTRAINT "services_price" CHECK ("services"."price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "therapist_services" (
	"therapist_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "therapist_services_therapist_id_service_id_pk" PRIMARY KEY("therapist_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "therapists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"accent" text DEFAULT '#2D6A4F' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "therapists_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "therapists_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "staff_role" DEFAULT 'therapist' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"therapist_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	CONSTRAINT "working_hours_weekday" CHECK ("working_hours"."weekday" between 0 and 6),
	CONSTRAINT "working_hours_order" CHECK ("working_hours"."end_time" > "working_hours"."start_time")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_services" ADD CONSTRAINT "therapist_services_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapist_services" ADD CONSTRAINT "therapist_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapists" ADD CONSTRAINT "therapists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_therapist_id_therapists_id_fk" FOREIGN KEY ("therapist_id") REFERENCES "public"."therapists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "overrides_date_idx" ON "availability_overrides" USING btree ("date");--> statement-breakpoint
CREATE INDEX "bookings_therapist_start_idx" ON "bookings" USING btree ("therapist_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_start_idx" ON "bookings" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "bookings_email_idx" ON "bookings" USING btree ("patient_email");--> statement-breakpoint
CREATE INDEX "email_log_booking_idx" ON "email_log" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "rate_limits_window_idx" ON "rate_limits" USING btree ("window_start");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "working_hours_therapist_idx" ON "working_hours" USING btree ("therapist_id","weekday");