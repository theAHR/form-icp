-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'UNDER_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PRINTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "public" BOOLEAN NOT NULL DEFAULT false,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'GENERAL',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "schema" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fatherName" TEXT,
    "nationalId" TEXT,
    "birthDate" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "photoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPLICANT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesId" TEXT,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmissionValue" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "FormSubmissionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipRequest" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "primarySubmissionId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "assignedTo" TEXT,
    "interviewCompleted" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipRequestSubmission" (
    "requestId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,

    CONSTRAINT "MembershipRequestSubmission_pkey" PRIMARY KEY ("requestId","submissionId")
);

-- CreateTable
CREATE TABLE "MembershipRequestHistory" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipRequestHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "membershipNumber" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "membershipType" TEXT NOT NULL DEFAULT 'عادی',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateSnapshot" JSONB NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "qrToken" TEXT NOT NULL,
    "printStatus" "PrintStatus" NOT NULL DEFAULT 'QUEUED',

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT,
    "type" TEXT NOT NULL DEFAULT 'MAGICARD_300_NEO',
    "status" TEXT NOT NULL DEFAULT 'OFFLINE',
    "location" TEXT,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,
    "status" "PrintStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "externalId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "ownerId" TEXT,
    "guestHash" TEXT,
    "submissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "ip" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "FormVersion_formId_number_key" ON "FormVersion"("formId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_versionId_key_key" ON "FormField"("versionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Person_nationalId_key" ON "Person"("nationalId");

-- CreateIndex
CREATE INDEX "Person_lastName_firstName_idx" ON "Person"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Person_mobile_idx" ON "Person"("mobile");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_supersedesId_key" ON "FormSubmission"("supersedesId");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmissionValue_submissionId_fieldKey_key" ON "FormSubmissionValue"("submissionId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRequest_sequence_key" ON "MembershipRequest"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRequest_requestNumber_key" ON "MembershipRequest"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRequest_primarySubmissionId_key" ON "MembershipRequest"("primarySubmissionId");

-- CreateIndex
CREATE INDEX "MembershipRequest_status_createdAt_idx" ON "MembershipRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipRequest_assignedTo_idx" ON "MembershipRequest"("assignedTo");

-- CreateIndex
CREATE INDEX "MembershipRequestHistory_requestId_createdAt_idx" ON "MembershipRequestHistory"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_membershipNumber_key" ON "Member"("membershipNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Member_personId_key" ON "Member"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_requestId_key" ON "Member"("requestId");

-- CreateIndex
CREATE INDEX "Member_status_expirationDate_idx" ON "Member"("status", "expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "Card_cardNumber_key" ON "Card"("cardNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Card_qrToken_key" ON "Card"("qrToken");

-- CreateIndex
CREATE INDEX "Card_memberId_idx" ON "Card"("memberId");

-- CreateIndex
CREATE INDEX "PrintJob_status_createdAt_idx" ON "PrintJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");

-- CreateIndex
CREATE INDEX "File_submissionId_idx" ON "File"("submissionId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "FormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FormVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FormVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmissionValue" ADD CONSTRAINT "FormSubmissionValue_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRequest" ADD CONSTRAINT "MembershipRequest_primarySubmissionId_fkey" FOREIGN KEY ("primarySubmissionId") REFERENCES "FormSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRequest" ADD CONSTRAINT "MembershipRequest_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRequest" ADD CONSTRAINT "MembershipRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRequestSubmission" ADD CONSTRAINT "MembershipRequestSubmission_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MembershipRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRequestSubmission" ADD CONSTRAINT "MembershipRequestSubmission_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRequestHistory" ADD CONSTRAINT "MembershipRequestHistory_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MembershipRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MembershipRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CardTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "FormSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Immutable snapshots and append-only audit records, enforced below the application layer.
CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical rows are immutable'; END;
$$;
CREATE TRIGGER immutable_form_version BEFORE UPDATE OR DELETE ON "FormVersion" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER immutable_form_field BEFORE UPDATE OR DELETE ON "FormField" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER immutable_submission BEFORE UPDATE OR DELETE ON "FormSubmission" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER immutable_submission_value BEFORE UPDATE OR DELETE ON "FormSubmissionValue" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER immutable_request_history BEFORE UPDATE OR DELETE ON "MembershipRequestHistory" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER append_only_audit BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
