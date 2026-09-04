-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SecurityTokenScope" AS ENUM ('PASSWORD_RESET', 'ACCOUNT_SETUP', 'TWO_FACTOR_CHALLENGE');

-- CreateEnum
CREATE TYPE "CallQueueSourceType" AS ENUM ('COMPLAINT', 'CALLBACK', 'MANUAL');

-- CreateEnum
CREATE TYPE "CallQueuePriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CallQueueStatus" AS ENUM ('NEW', 'CLAIMED', 'IN_PROGRESS', 'CALLBACK_SCHEDULED', 'COMPLETED', 'UNREACHABLE', 'REFUSED', 'INVALID_CONTACT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallSessionMode" AS ENUM ('MANUAL', 'PROVIDER');

-- CreateEnum
CREATE TYPE "CallSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('CALL_COMPLETED', 'NO_ANSWER', 'WRONG_NUMBER', 'PHONE_OFF', 'BUSY', 'CALLBACK_REQUESTED', 'REFUSED_PARTICIPATION', 'FOLLOW_UP_COMPLETED');

-- CreateEnum
CREATE TYPE "CallCallbackStatus" AS ENUM ('SCHEDULED', 'DUE', 'CLAIMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallCallbackReason" AS ENUM ('CUSTOMER_REQUESTED', 'NO_ANSWER_RETRY', 'PHONE_OFF_RETRY', 'BUSY_RETRY');

-- CreateEnum
CREATE TYPE "CallRecordingStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "TemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ComplaintSourceType" AS ENUM ('CALL_CENTER', 'MANUAL', 'SYSTEM_ROUTING');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ComplaintLifecycleStatus" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplaintStage" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "WaitingReason" AS ENUM ('CUSTOMER', 'DOCUMENTS', 'OTHER_DEPARTMENT', 'APPROVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintRoutingStatus" AS ENUM ('ROUTED', 'UNROUTED');

-- CreateEnum
CREATE TYPE "ComplaintSummaryStatus" AS ENUM ('GENERATED', 'UNAVAILABLE', 'NOT_REQUESTED');

-- CreateEnum
CREATE TYPE "RoutingFactType" AS ENUM ('SOURCE_TYPE', 'COMPLAINT_REQUESTED');

-- CreateEnum
CREATE TYPE "RoutingRuleOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'IN', 'IS_TRUE');

-- CreateEnum
CREATE TYPE "ComplaintActionType" AS ENUM ('PHONE_CALL', 'WHATSAPP', 'EMAIL', 'SMS', 'VISIT_MEETING', 'INTERNAL_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintTimelineEventType" AS ENUM ('COMPLAINT_OPENED', 'ROUTED', 'DEPARTMENT_CHANGED', 'ASSIGNED', 'REASSIGNED', 'PRIORITY_CHANGED', 'STAGE_CHANGED', 'FIRST_RESPONSE', 'ACTION_ADDED', 'ATTACHMENT_ADDED', 'SLA_WARNING', 'SLA_BREACHED', 'ESCALATED', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "EscalationTrigger" AS ENUM ('MANUAL', 'SLA_BREACH', 'SLA_BREACH_DELAY');

-- CreateEnum
CREATE TYPE "ComplaintAttachmentStatus" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "ComplaintNotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "ComplaintDeliveryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'MAPPING_REQUIRED', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowResultStatus" AS ENUM ('IMPORTED', 'UPDATED', 'SKIPPED', 'FAILED', 'NEEDS_MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "KpiScopeType" AS ENUM ('GLOBAL', 'BRANCH');

-- CreateEnum
CREATE TYPE "ReportPeriodType" AS ENUM ('MONTH', 'QUARTER', 'YEAR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'XLSX', 'PDF');

-- CreateEnum
CREATE TYPE "ReportScheduleRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ReportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'NOT_CONFIGURED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('ERP', 'CRM', 'WHATSAPP', 'SMS', 'EMAIL', 'SSO_ACTIVE_DIRECTORY', 'POWER_BI', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'HEALTHY', 'DEGRADED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "passwordHash" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecretEncrypted" TEXT,
    "twoFactorEnabledAt" TIMESTAMP(3),
    "twoFactorPendingSecretEncrypted" TEXT,
    "twoFactorPendingExpiresAt" TIMESTAMP(3),
    "twoFactorLastUsedStep" INTEGER,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_recovery_codes" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_department_assignments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_department_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branch_assignments" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_branch_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "familyId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_tokens" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "SecurityTokenScope" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_center_queue_items" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "purchaseExperienceId" INTEGER,
    "branchId" INTEGER,
    "sourceType" "CallQueueSourceType" NOT NULL,
    "reasonCode" TEXT,
    "reasonSummary" TEXT,
    "priority" "CallQueuePriority" NOT NULL DEFAULT 'MEDIUM',
    "priorityRank" INTEGER NOT NULL DEFAULT 500,
    "status" "CallQueueStatus" NOT NULL DEFAULT 'NEW',
    "assignedToUserId" INTEGER,
    "claimedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "unansweredAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "wantsFurtherContact" BOOLEAN,
    "complaintRequested" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_center_queue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_sessions" (
    "id" SERIAL NOT NULL,
    "queueItemId" INTEGER NOT NULL,
    "agentUserId" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "mode" "CallSessionMode" NOT NULL DEFAULT 'MANUAL',
    "status" "CallSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "outcome" "CallOutcome",
    "providerCallId" TEXT,
    "recordingStatus" "CallRecordingStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "internalNote" TEXT,
    "wantsFurtherContact" BOOLEAN,
    "complaintRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_callbacks" (
    "id" SERIAL NOT NULL,
    "queueItemId" INTEGER NOT NULL,
    "callSessionId" INTEGER,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "reason" "CallCallbackReason" NOT NULL,
    "status" "CallCallbackStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_callbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_recordings" (
    "id" SERIAL NOT NULL,
    "callSessionId" INTEGER NOT NULL,
    "providerRecordingId" TEXT,
    "storageKey" TEXT,
    "status" "CallRecordingStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" INTEGER,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_template_versions" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "TemplateVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_variants" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "subject" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "providerTemplateName" TEXT,
    "providerLanguageCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_buttons" (
    "id" SERIAL NOT NULL,
    "variantId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "urlTemplate" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_buttons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "defaultDepartmentId" INTEGER,
    "defaultPriority" "ComplaintPriority",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_routing_rules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "sourceType" "ComplaintSourceType",
    "factType" "RoutingFactType" NOT NULL,
    "operator" "RoutingRuleOperator" NOT NULL,
    "valueString" TEXT,
    "valueNumber" INTEGER,
    "valueBool" BOOLEAN,
    "categoryId" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "assignedToUserId" INTEGER,
    "priority" "ComplaintPriority" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_notification_settings" (
    "id" SERIAL NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "ComplaintNotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_notification_deliveries" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "dedupeSuffix" TEXT NOT NULL DEFAULT '',
    "channel" "ComplaintNotificationChannel" NOT NULL,
    "recipientUserId" INTEGER NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ar',
    "status" "ComplaintDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_sla_policies" (
    "id" SERIAL NOT NULL,
    "priority" "ComplaintPriority" NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "warningBeforeMinutes" INTEGER NOT NULL,
    "breachEscalationDelayMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaint_sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" SERIAL NOT NULL,
    "publicNumber" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "purchaseExperienceId" INTEGER,
    "branchId" INTEGER,
    "categoryId" INTEGER,
    "departmentId" INTEGER,
    "assignedToUserId" INTEGER,
    "sourceType" "ComplaintSourceType" NOT NULL,
    "sourceId" TEXT,
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "lifecycleStatus" "ComplaintLifecycleStatus" NOT NULL DEFAULT 'OPEN',
    "stage" "ComplaintStage" NOT NULL DEFAULT 'NEW',
    "waitingReason" "WaitingReason",
    "waitingReasonNote" TEXT,
    "routingStatus" "ComplaintRoutingStatus" NOT NULL DEFAULT 'UNROUTED',
    "routingRuleId" INTEGER,
    "routingSnapshot" JSONB,
    "description" TEXT,
    "systemSummary" TEXT,
    "summaryStatus" "ComplaintSummaryStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
    "firstRespondedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" INTEGER,
    "resolutionSummary" TEXT,
    "solutionProposed" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" INTEGER,
    "closureCount" INTEGER NOT NULL DEFAULT 0,
    "reopenedCount" INTEGER NOT NULL DEFAULT 0,
    "lastReopenedAt" TIMESTAMP(3),
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalatedAt" TIMESTAMP(3),
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "slaCurrentCycleNumber" INTEGER,
    "slaFirstResponseDueAt" TIMESTAMP(3),
    "slaResolutionDueAt" TIMESTAMP(3),
    "slaWarnAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_sla_cycles" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "prioritySnapshot" "ComplaintPriority" NOT NULL,
    "firstResponseMinutes" INTEGER NOT NULL,
    "resolutionMinutes" INTEGER NOT NULL,
    "warningBeforeMinutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "warningAt" TIMESTAMP(3) NOT NULL,
    "firstRespondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "firstResponseBreachedAt" TIMESTAMP(3),
    "resolutionBreachedAt" TIMESTAMP(3),
    "warningNotifiedAt" TIMESTAMP(3),
    "breachEscalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_sla_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_escalations" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "reason" TEXT,
    "fromDepartmentId" INTEGER,
    "toDepartmentId" INTEGER,
    "fromUserId" INTEGER,
    "toUserId" INTEGER,
    "triggerType" "EscalationTrigger" NOT NULL,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_actions" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "type" "ComplaintActionType" NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "customerVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_timeline_events" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "type" "ComplaintTimelineEventType" NOT NULL,
    "actorUserId" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_attachments" (
    "id" TEXT NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "actionId" INTEGER,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" INTEGER,
    "status" "ComplaintAttachmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" SERIAL NOT NULL,
    "sourceType" "ImportSourceType" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileHash" TEXT,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "mapping" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "manualReviewRows" INTEGER NOT NULL DEFAULT 0,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row_outcomes" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ImportRowResultStatus" NOT NULL,
    "customerId" INTEGER,
    "vehicleId" INTEGER,
    "experienceId" INTEGER,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_row_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "regionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cityId" INTEGER,
    "managerUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_models" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "modelYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salespeople" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT,
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" INTEGER,
    "branchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salespeople_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_definitions" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultChannels" JSONB NOT NULL DEFAULT '["IN_APP"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" JSONB NOT NULL DEFAULT '["IN_APP"]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_logs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "reason" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    "optOutEmail" BOOLEAN NOT NULL DEFAULT false,
    "optOutSms" BOOLEAN NOT NULL DEFAULT false,
    "optOutPhone" BOOLEAN NOT NULL DEFAULT false,
    "optOutWhatsApp" BOOLEAN NOT NULL DEFAULT false,
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "vin" TEXT,
    "modelId" INTEGER NOT NULL,
    "modelYear" INTEGER,
    "color" TEXT,
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_experiences" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "salespersonId" INTEGER,
    "purchaseDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "externalSaleId" TEXT,
    "financingType" TEXT,
    "insuranceType" TEXT,
    "salesChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_outbox_events" (
    "id" SERIAL NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 10,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_kpi_targets" (
    "id" SERIAL NOT NULL,
    "kpiCode" TEXT NOT NULL,
    "scopeType" "KpiScopeType" NOT NULL DEFAULT 'GLOBAL',
    "branchId" INTEGER,
    "periodType" "ReportPeriodType" NOT NULL DEFAULT 'MONTH',
    "targetValue" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "reportCode" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'XLSX',
    "filters" JSONB,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "recurrence" "ReportScheduleRecurrence" NOT NULL DEFAULT 'MONTHLY',
    "hourOfDay" INTEGER NOT NULL DEFAULT 8,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "recipientUserIds" JSONB,
    "recipientEmails" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_artifacts" (
    "id" TEXT NOT NULL,
    "reportCode" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filtersSnapshot" JSONB,
    "scopeSnapshot" JSONB,
    "generatedByUserId" INTEGER,
    "scheduleId" INTEGER,
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "status" "ReportJobStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryStatus" "ReportDeliveryStatus",
    "errorCode" TEXT,
    "runDedupeKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" SERIAL NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "configured" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "metadata" JSONB,
    "secretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "allBranches" BOOLEAN NOT NULL DEFAULT false,
    "branchScope" JSONB,
    "createdByUserId" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" TEXT NOT NULL,
    "apiKeyId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "SettingType" NOT NULL DEFAULT 'STRING',
    "scope" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resultRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_recovery_codes_codeHash_key" ON "two_factor_recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "two_factor_recovery_codes_userId_idx" ON "two_factor_recovery_codes"("userId");

-- CreateIndex
CREATE INDEX "user_department_assignments_userId_idx" ON "user_department_assignments"("userId");

-- CreateIndex
CREATE INDEX "user_department_assignments_departmentId_idx" ON "user_department_assignments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_department_assignments_userId_departmentId_key" ON "user_department_assignments"("userId", "departmentId");

-- CreateIndex
CREATE INDEX "user_branch_assignments_userId_idx" ON "user_branch_assignments"("userId");

-- CreateIndex
CREATE INDEX "user_branch_assignments_branchId_idx" ON "user_branch_assignments"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "user_branch_assignments_userId_branchId_key" ON "user_branch_assignments"("userId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_category_idx" ON "permissions"("category");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_sessions_familyId_idx" ON "auth_sessions"("familyId");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "security_tokens_tokenHash_key" ON "security_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "security_tokens_userId_scope_idx" ON "security_tokens"("userId", "scope");

-- CreateIndex
CREATE INDEX "security_tokens_expiresAt_idx" ON "security_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_center_queue_items_dedupeKey_key" ON "call_center_queue_items"("dedupeKey");

-- CreateIndex
CREATE INDEX "call_center_queue_items_status_idx" ON "call_center_queue_items"("status");

-- CreateIndex
CREATE INDEX "call_center_queue_items_priorityRank_idx" ON "call_center_queue_items"("priorityRank");

-- CreateIndex
CREATE INDEX "call_center_queue_items_branchId_idx" ON "call_center_queue_items"("branchId");

-- CreateIndex
CREATE INDEX "call_center_queue_items_assignedToUserId_idx" ON "call_center_queue_items"("assignedToUserId");

-- CreateIndex
CREATE INDEX "call_center_queue_items_customerId_idx" ON "call_center_queue_items"("customerId");

-- CreateIndex
CREATE INDEX "call_center_queue_items_dueAt_idx" ON "call_center_queue_items"("dueAt");

-- CreateIndex
CREATE INDEX "call_center_queue_items_sourceType_idx" ON "call_center_queue_items"("sourceType");

-- CreateIndex
CREATE INDEX "call_center_queue_items_status_priorityRank_dueAt_idx" ON "call_center_queue_items"("status", "priorityRank", "dueAt");

-- CreateIndex
CREATE INDEX "call_sessions_queueItemId_idx" ON "call_sessions"("queueItemId");

-- CreateIndex
CREATE INDEX "call_sessions_agentUserId_idx" ON "call_sessions"("agentUserId");

-- CreateIndex
CREATE INDEX "call_sessions_status_idx" ON "call_sessions"("status");

-- CreateIndex
CREATE INDEX "call_sessions_outcome_idx" ON "call_sessions"("outcome");

-- CreateIndex
CREATE INDEX "call_sessions_startedAt_idx" ON "call_sessions"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_callbacks_callSessionId_key" ON "call_callbacks"("callSessionId");

-- CreateIndex
CREATE INDEX "call_callbacks_queueItemId_idx" ON "call_callbacks"("queueItemId");

-- CreateIndex
CREATE INDEX "call_callbacks_status_idx" ON "call_callbacks"("status");

-- CreateIndex
CREATE INDEX "call_callbacks_scheduledAt_idx" ON "call_callbacks"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "call_recordings_callSessionId_key" ON "call_recordings"("callSessionId");

-- CreateIndex
CREATE INDEX "call_recordings_status_idx" ON "call_recordings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_code_key" ON "message_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_currentVersionId_key" ON "message_templates"("currentVersionId");

-- CreateIndex
CREATE INDEX "message_templates_channel_idx" ON "message_templates"("channel");

-- CreateIndex
CREATE INDEX "message_templates_isActive_idx" ON "message_templates"("isActive");

-- CreateIndex
CREATE INDEX "message_template_versions_templateId_idx" ON "message_template_versions"("templateId");

-- CreateIndex
CREATE INDEX "message_template_versions_status_idx" ON "message_template_versions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "message_template_versions_templateId_versionNumber_key" ON "message_template_versions"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "template_variants_versionId_idx" ON "template_variants"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "template_variants_versionId_language_key" ON "template_variants"("versionId", "language");

-- CreateIndex
CREATE INDEX "template_buttons_variantId_idx" ON "template_buttons"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_categories_code_key" ON "complaint_categories"("code");

-- CreateIndex
CREATE INDEX "complaint_categories_active_idx" ON "complaint_categories"("active");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_routing_rules_code_key" ON "complaint_routing_rules"("code");

-- CreateIndex
CREATE INDEX "complaint_routing_rules_active_sortOrder_idx" ON "complaint_routing_rules"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "complaint_routing_rules_categoryId_idx" ON "complaint_routing_rules"("categoryId");

-- CreateIndex
CREATE INDEX "complaint_routing_rules_assignedToUserId_idx" ON "complaint_routing_rules"("assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_notification_settings_eventKey_channel_key" ON "complaint_notification_settings"("eventKey", "channel");

-- CreateIndex
CREATE INDEX "complaint_notification_deliveries_status_nextAttemptAt_idx" ON "complaint_notification_deliveries"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "complaint_notification_deliveries_complaintId_idx" ON "complaint_notification_deliveries"("complaintId");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_notification_deliveries_complaintId_eventKey_dedu_key" ON "complaint_notification_deliveries"("complaintId", "eventKey", "dedupeSuffix", "channel", "recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_sla_policies_priority_key" ON "complaint_sla_policies"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_publicNumber_key" ON "complaints"("publicNumber");

-- CreateIndex
CREATE INDEX "complaints_branchId_idx" ON "complaints"("branchId");

-- CreateIndex
CREATE INDEX "complaints_customerId_idx" ON "complaints"("customerId");

-- CreateIndex
CREATE INDEX "complaints_departmentId_idx" ON "complaints"("departmentId");

-- CreateIndex
CREATE INDEX "complaints_assignedToUserId_idx" ON "complaints"("assignedToUserId");

-- CreateIndex
CREATE INDEX "complaints_categoryId_idx" ON "complaints"("categoryId");

-- CreateIndex
CREATE INDEX "complaints_lifecycleStatus_idx" ON "complaints"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "complaints_stage_idx" ON "complaints"("stage");

-- CreateIndex
CREATE INDEX "complaints_priority_idx" ON "complaints"("priority");

-- CreateIndex
CREATE INDEX "complaints_slaResolutionDueAt_idx" ON "complaints"("slaResolutionDueAt");

-- CreateIndex
CREATE INDEX "complaints_isLate_idx" ON "complaints"("isLate");

-- CreateIndex
CREATE INDEX "complaints_isEscalated_idx" ON "complaints"("isEscalated");

-- CreateIndex
CREATE INDEX "complaints_createdAt_idx" ON "complaints"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_sourceType_sourceId_key" ON "complaints"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "complaint_sla_cycles_complaintId_idx" ON "complaint_sla_cycles"("complaintId");

-- CreateIndex
CREATE INDEX "complaint_sla_cycles_closedAt_resolutionDueAt_idx" ON "complaint_sla_cycles"("closedAt", "resolutionDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_sla_cycles_complaintId_cycleNumber_key" ON "complaint_sla_cycles"("complaintId", "cycleNumber");

-- CreateIndex
CREATE INDEX "complaint_escalations_complaintId_idx" ON "complaint_escalations"("complaintId");

-- CreateIndex
CREATE INDEX "complaint_escalations_toDepartmentId_idx" ON "complaint_escalations"("toDepartmentId");

-- CreateIndex
CREATE INDEX "complaint_escalations_toUserId_idx" ON "complaint_escalations"("toUserId");

-- CreateIndex
CREATE INDEX "complaint_actions_complaintId_createdAt_idx" ON "complaint_actions"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "complaint_timeline_events_complaintId_createdAt_idx" ON "complaint_timeline_events"("complaintId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_attachments_storageKey_key" ON "complaint_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "complaint_attachments_complaintId_idx" ON "complaint_attachments"("complaintId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_storageKey_key" ON "import_jobs"("storageKey");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE INDEX "import_jobs_createdById_idx" ON "import_jobs"("createdById");

-- CreateIndex
CREATE INDEX "import_jobs_fileHash_idx" ON "import_jobs"("fileHash");

-- CreateIndex
CREATE INDEX "import_row_outcomes_jobId_idx" ON "import_row_outcomes"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "import_row_outcomes_jobId_rowNumber_key" ON "import_row_outcomes"("jobId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_isActive_idx" ON "regions"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "cities_code_key" ON "cities"("code");

-- CreateIndex
CREATE INDEX "cities_regionId_idx" ON "cities"("regionId");

-- CreateIndex
CREATE INDEX "cities_isActive_idx" ON "cities"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_normalizedName_key" ON "branches"("normalizedName");

-- CreateIndex
CREATE INDEX "branches_cityId_idx" ON "branches"("cityId");

-- CreateIndex
CREATE INDEX "branches_isActive_idx" ON "branches"("isActive");

-- CreateIndex
CREATE INDEX "branches_managerUserId_idx" ON "branches"("managerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_code_key" ON "vehicle_models"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_models_normalizedName_key" ON "vehicle_models"("normalizedName");

-- CreateIndex
CREATE INDEX "vehicle_models_isActive_idx" ON "vehicle_models"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_branchId_idx" ON "departments"("branchId");

-- CreateIndex
CREATE INDEX "departments_isActive_idx" ON "departments"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "departments_branchId_normalizedName_key" ON "departments"("branchId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "salespeople_code_key" ON "salespeople"("code");

-- CreateIndex
CREATE UNIQUE INDEX "salespeople_externalId_key" ON "salespeople"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "salespeople_userId_key" ON "salespeople"("userId");

-- CreateIndex
CREATE INDEX "salespeople_branchId_idx" ON "salespeople"("branchId");

-- CreateIndex
CREATE INDEX "salespeople_isActive_idx" ON "salespeople"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "salespeople_branchId_normalizedName_key" ON "salespeople"("branchId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "notification_definitions_key_key" ON "notification_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_userId_eventKey_key" ON "notification_preferences"("userId", "eventKey");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_delivery_logs_dedupeKey_key" ON "notification_delivery_logs"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_userId_eventKey_idx" ON "notification_delivery_logs"("userId", "eventKey");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_status_idx" ON "notification_delivery_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_externalId_key" ON "customers"("externalId");

-- CreateIndex
CREATE INDEX "customers_mobile_idx" ON "customers"("mobile");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_externalId_key" ON "vehicles"("externalId");

-- CreateIndex
CREATE INDEX "vehicles_modelId_idx" ON "vehicles"("modelId");

-- CreateIndex
CREATE INDEX "vehicles_isActive_idx" ON "vehicles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_experiences_externalSaleId_key" ON "purchase_experiences"("externalSaleId");

-- CreateIndex
CREATE INDEX "purchase_experiences_customerId_idx" ON "purchase_experiences"("customerId");

-- CreateIndex
CREATE INDEX "purchase_experiences_vehicleId_idx" ON "purchase_experiences"("vehicleId");

-- CreateIndex
CREATE INDEX "purchase_experiences_branchId_idx" ON "purchase_experiences"("branchId");

-- CreateIndex
CREATE INDEX "purchase_experiences_salespersonId_idx" ON "purchase_experiences"("salespersonId");

-- CreateIndex
CREATE INDEX "purchase_experiences_purchaseDate_idx" ON "purchase_experiences"("purchaseDate");

-- CreateIndex
CREATE INDEX "purchase_experiences_deliveryDate_idx" ON "purchase_experiences"("deliveryDate");

-- CreateIndex
CREATE UNIQUE INDEX "domain_outbox_events_dedupeKey_key" ON "domain_outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "domain_outbox_events_status_availableAt_idx" ON "domain_outbox_events"("status", "availableAt");

-- CreateIndex
CREATE INDEX "domain_outbox_events_lockedAt_idx" ON "domain_outbox_events"("lockedAt");

-- CreateIndex
CREATE INDEX "domain_outbox_events_aggregateType_aggregateId_idx" ON "domain_outbox_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "report_kpi_targets_kpiCode_scopeType_branchId_idx" ON "report_kpi_targets"("kpiCode", "scopeType", "branchId");

-- CreateIndex
CREATE INDEX "report_schedules_enabled_nextRunAt_idx" ON "report_schedules"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_artifacts_storageKey_key" ON "report_artifacts"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "report_artifacts_runDedupeKey_key" ON "report_artifacts"("runDedupeKey");

-- CreateIndex
CREATE INDEX "report_artifacts_reportCode_idx" ON "report_artifacts"("reportCode");

-- CreateIndex
CREATE INDEX "report_artifacts_status_idx" ON "report_artifacts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_kind_name_key" ON "integration_connections"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_secretHash_key" ON "api_keys"("secretHash");

-- CreateIndex
CREATE INDEX "api_keys_revokedAt_idx" ON "api_keys"("revokedAt");

-- CreateIndex
CREATE INDEX "api_usage_logs_apiKeyId_createdAt_idx" ON "api_usage_logs"("apiKeyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "settings_scope_idx" ON "settings"("scope");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_assignments" ADD CONSTRAINT "user_department_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_assignments" ADD CONSTRAINT "user_department_assignments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_assignments" ADD CONSTRAINT "user_branch_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_assignments" ADD CONSTRAINT "user_branch_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_tokens" ADD CONSTRAINT "security_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_center_queue_items" ADD CONSTRAINT "call_center_queue_items_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_center_queue_items" ADD CONSTRAINT "call_center_queue_items_purchaseExperienceId_fkey" FOREIGN KEY ("purchaseExperienceId") REFERENCES "purchase_experiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_center_queue_items" ADD CONSTRAINT "call_center_queue_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_center_queue_items" ADD CONSTRAINT "call_center_queue_items_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "call_center_queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_sessions" ADD CONSTRAINT "call_sessions_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_callbacks" ADD CONSTRAINT "call_callbacks_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "call_center_queue_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_callbacks" ADD CONSTRAINT "call_callbacks_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "call_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "call_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "message_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_template_versions" ADD CONSTRAINT "message_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_template_versions" ADD CONSTRAINT "message_template_versions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_variants" ADD CONSTRAINT "template_variants_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "message_template_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_buttons" ADD CONSTRAINT "template_buttons_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "template_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_categories" ADD CONSTRAINT "complaint_categories_defaultDepartmentId_fkey" FOREIGN KEY ("defaultDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_routing_rules" ADD CONSTRAINT "complaint_routing_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "complaint_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_routing_rules" ADD CONSTRAINT "complaint_routing_rules_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_routing_rules" ADD CONSTRAINT "complaint_routing_rules_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_notification_deliveries" ADD CONSTRAINT "complaint_notification_deliveries_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_purchaseExperienceId_fkey" FOREIGN KEY ("purchaseExperienceId") REFERENCES "purchase_experiences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "complaint_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_routingRuleId_fkey" FOREIGN KEY ("routingRuleId") REFERENCES "complaint_routing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_sla_cycles" ADD CONSTRAINT "complaint_sla_cycles_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_escalations" ADD CONSTRAINT "complaint_escalations_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_actions" ADD CONSTRAINT "complaint_actions_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_timeline_events" ADD CONSTRAINT "complaint_timeline_events_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "complaint_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_outcomes" ADD CONSTRAINT "import_row_outcomes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salespeople" ADD CONSTRAINT "salespeople_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salespeople" ADD CONSTRAINT "salespeople_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_logs" ADD CONSTRAINT "notification_delivery_logs_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "salespeople"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

