CREATE TYPE "public"."account_entitlement" AS ENUM('PRIVATE_CATALOG');--> statement-breakpoint
CREATE TABLE "user_entitlements" (
	"user_id" integer NOT NULL,
	"entitlement" "account_entitlement" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_entitlements_user_id_entitlement_pk" PRIMARY KEY("user_id","entitlement")
);
--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;