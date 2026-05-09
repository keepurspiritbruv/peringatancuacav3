CREATE TABLE "beaches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(100) NOT NULL,
	"latitude" real,
	"longitude" real,
	"community_risk_level" text,
	CONSTRAINT "beaches_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bmkg_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"beach_id" integer,
	"weather" jsonb,
	"wave_forecast" jsonb,
	"warning" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reassurance_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" uuid,
	"shap_risk" text,
	"bmkg_risk" text,
	"agreed" boolean,
	"final_level" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reassurance_results_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"beach_id" integer,
	"reporter_id" text,
	"source" varchar(20) NOT NULL,
	"natural_signs" jsonb NOT NULL,
	"raw_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shap_predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" uuid,
	"risk_level" text NOT NULL,
	"community_characteristics" text,
	"validated_signs" jsonb,
	"actions" jsonb,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bmkg_snapshots" ADD CONSTRAINT "bmkg_snapshots_beach_id_beaches_id_fk" FOREIGN KEY ("beach_id") REFERENCES "public"."beaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reassurance_results" ADD CONSTRAINT "reassurance_results_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_beach_id_beaches_id_fk" FOREIGN KEY ("beach_id") REFERENCES "public"."beaches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shap_predictions" ADD CONSTRAINT "shap_predictions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;