-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_wrap" TEXT NOT NULL,
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "send_count" INTEGER NOT NULL DEFAULT 0,
    "resend_window_start_at" TIMESTAMP(3),
    "resends_in_window" INTEGER NOT NULL DEFAULT 0,
    "assigned_role" "Role" NOT NULL,
    "seed_name" TEXT NOT NULL,
    "departments_json" JSONB,
    "default_studio_id" TEXT,
    "additional_studio_ids" JSONB,
    "created_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitations_created_user_id_key" ON "user_invitations"("created_user_id");

-- CreateIndex
CREATE INDEX "user_invitations_token_hash_idx" ON "user_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "user_invitations_email_normalized_idx" ON "user_invitations"("email_normalized");

-- CreateIndex
CREATE INDEX "user_invitations_status_idx" ON "user_invitations"("status");

-- Partial unique: one PENDING invite per normalized email
CREATE UNIQUE INDEX "user_invitations_one_pending_email" ON "user_invitations"("email_normalized")
WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_created_user_id_fkey" FOREIGN KEY ("created_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
