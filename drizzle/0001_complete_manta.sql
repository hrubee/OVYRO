CREATE TABLE "metrics_daily" (
	"date" date NOT NULL,
	"metric" text NOT NULL,
	"dimension" text DEFAULT '' NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_daily_date_metric_dimension_pk" PRIMARY KEY("date","metric","dimension")
);
--> statement-breakpoint
CREATE INDEX "metrics_daily_metric_date_idx" ON "metrics_daily" USING btree ("metric","date");