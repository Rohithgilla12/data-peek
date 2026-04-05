CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"clerk_user_id" text,
	"dodo_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email"),
	CONSTRAINT "customers_clerk_user_id_unique" UNIQUE("clerk_user_id"),
	CONSTRAINT "customers_dodo_customer_id_unique" UNIQUE("dodo_customer_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"query" text NOT NULL,
	"config" jsonb,
	"position" jsonb,
	"refresh_interval" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"layout" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"query" text NOT NULL,
	"status" text NOT NULL,
	"duration_ms" integer,
	"row_count" integer,
	"error_message" text,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_queries_web" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"description" text,
	"category" text,
	"tags" text[],
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"date" date NOT NULL,
	"query_count" integer DEFAULT 0 NOT NULL,
	"ai_message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"db_type" text NOT NULL,
	"environment" text DEFAULT 'development' NOT NULL,
	"encrypted_credentials" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"ssl_enabled" boolean DEFAULT false NOT NULL,
	"last_connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"editor_config" jsonb,
	"encrypted_ai_keys" "bytea",
	"ai_iv" "bytea",
	"ai_auth_tag" "bytea",
	"active_ai_provider" text,
	"active_ai_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_connection_id_user_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_connection_id_user_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries_web" ADD CONSTRAINT "saved_queries_web_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_queries_web" ADD CONSTRAINT "saved_queries_web_connection_id_user_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."user_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_tracking" ADD CONSTRAINT "usage_tracking_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_connections" ADD CONSTRAINT "user_connections_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dashboard_widgets_dashboard" ON "dashboard_widgets" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "idx_dashboards_customer" ON "dashboards" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_query_history_customer" ON "query_history" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_query_history_connection" ON "query_history" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "idx_query_history_executed_at" ON "query_history" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "idx_saved_queries_web_customer" ON "saved_queries_web" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_saved_queries_web_connection" ON "saved_queries_web" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_tracking_customer_date" ON "usage_tracking" USING btree ("customer_id","date");--> statement-breakpoint
CREATE INDEX "idx_user_connections_customer" ON "user_connections" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_settings_customer" ON "user_settings" USING btree ("customer_id");