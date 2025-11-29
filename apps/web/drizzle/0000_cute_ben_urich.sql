CREATE TABLE "activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text,
	"os" text,
	"app_version" text,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_validated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"license_key" text NOT NULL,
	"plan" text DEFAULT 'pro' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_activations" integer DEFAULT 3 NOT NULL,
	"dodo_payment_id" text,
	"dodo_product_id" text,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updates_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_license_key_unique" UNIQUE("license_key"),
	CONSTRAINT "licenses_dodo_payment_id_unique" UNIQUE("dodo_payment_id")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"release_notes" text,
	"download_url_mac" text,
	"download_url_mac_arm" text,
	"download_url_windows" text,
	"download_url_linux" text,
	"is_latest" boolean DEFAULT false NOT NULL,
	"min_supported_version" text,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "activations" ADD CONSTRAINT "activations_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activations_license" ON "activations" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "idx_activations_device" ON "activations" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_customers_email" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_customers_clerk_id" ON "customers" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "idx_licenses_customer" ON "licenses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_licenses_key" ON "licenses" USING btree ("license_key");--> statement-breakpoint
CREATE INDEX "idx_licenses_status" ON "licenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_releases_version" ON "releases" USING btree ("version");