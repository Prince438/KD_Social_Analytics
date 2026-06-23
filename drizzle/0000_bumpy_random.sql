CREATE TYPE "public"."platform" AS ENUM('youtube', 'instagram', 'facebook', 'threads', 'tiktok', 'x', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TABLE "account_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linked_account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"followers" integer DEFAULT 0,
	"follower_change" integer DEFAULT 0,
	"views" integer DEFAULT 0,
	"engagement" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"source" text DEFAULT 'oauth' NOT NULL,
	"platform_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"date" date NOT NULL,
	"views" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"saves" integer DEFAULT 0,
	"reach" integer DEFAULT 0,
	"impressions" integer DEFAULT 0,
	"engagement_rate" double precision DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linked_account_id" uuid NOT NULL,
	"platform_post_id" text NOT NULL,
	"type" text,
	"caption" text,
	"url" text,
	"thumbnail_url" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"linked_account_id" uuid,
	"platform" "platform" NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"posts_synced" integer DEFAULT 0,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_metrics_daily" ADD CONSTRAINT "account_metrics_daily_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD CONSTRAINT "metrics_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_linked_account_id_linked_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."linked_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_metrics_daily_acct_date_idx" ON "account_metrics_daily" USING btree ("linked_account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_accounts_platform_acct_idx" ON "linked_accounts" USING btree ("platform","platform_account_id","workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_daily_post_date_idx" ON "metrics_daily" USING btree ("post_id","date");--> statement-breakpoint
CREATE INDEX "metrics_daily_date_idx" ON "metrics_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_account_post_idx" ON "posts" USING btree ("linked_account_id","platform_post_id");--> statement-breakpoint
CREATE INDEX "posts_published_idx" ON "posts" USING btree ("published_at");