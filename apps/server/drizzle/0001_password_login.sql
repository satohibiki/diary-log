ALTER TYPE "public"."otp_purpose" ADD VALUE 'new_device';--> statement-breakpoint
ALTER TYPE "public"."session_scope" ADD VALUE 'device_check';--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_devices_user_id_token_hash_pk" PRIMARY KEY("user_id","token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trusted_devices_expires_idx" ON "trusted_devices" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_password_pair" CHECK (("users"."password_hash" IS NULL) = ("users"."password_changed_at" IS NULL));