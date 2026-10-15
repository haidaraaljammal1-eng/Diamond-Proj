-- Sealed Phase 1 baseline schema (phase1-20261015).
-- Do not regenerate this file over later migrations.
-- Future migrations execute through prisma migrate deploy.

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
CREATE TYPE "ContractStatus" AS ENUM ('AWAITING', 'FORM', 'SIGNED', 'PAID', 'ACTIVE', 'RETOUT', 'REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContractPriceType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ContractDurationUnit" AS ENUM ('HOUR', 'DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "ContractLinkType" AS ENUM ('RENTAL', 'RETURN', 'RENEWAL', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "ContractPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'CASH', 'MANUAL');

-- CreateEnum
CREATE TYPE "RentalCollectionMode" AS ENUM ('ELECTRONIC', 'CASH');

-- CreateEnum
CREATE TYPE "ContractPaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractPaymentPurpose" AS ENUM ('RENTAL', 'RENEWAL', 'RECONCILIATION', 'POST_CLOSE_RECEIVABLE', 'ROAD_LIABILITY');

-- CreateEnum
CREATE TYPE "ContractPaymentOffSessionAttemptStatus" AS ENUM ('PREPARING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REQUIRES_ACTION');

-- CreateEnum
CREATE TYPE "ContractPaymentAttemptStatus" AS ENUM ('PREPARING', 'RECOVERING', 'READY', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ContractDocumentType" AS ENUM ('DRIVING_LICENSE', 'PASSPORT');

-- CreateEnum
CREATE TYPE "OfficialContractSignatureSlot" AS ENUM ('HIRER', 'ADDITIONAL_DRIVER', 'SPONSOR', 'VEHICLE_OUT_HIRER', 'VEHICLE_IN_HIRER');

-- CreateEnum
CREATE TYPE "PassportExtractionStatus" AS ENUM ('PROCESSING', 'READY', 'NOT_RECOGNIZED', 'FAILED', 'PROVIDER_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DrivingLicenseVerificationStatus" AS ENUM ('PENDING', 'VALID', 'EXPIRED', 'UNREADABLE', 'REVIEW_REQUIRED', 'PROVIDER_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DrivingLicenseExtractionStatus" AS ENUM ('PROCESSING', 'READY', 'PARTIAL', 'FAILED', 'PROVIDER_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CustomerDocumentType" AS ENUM ('IDENTITY', 'PASSPORT', 'DRIVING_LICENSE');

-- CreateEnum
CREATE TYPE "ContractReconciliationLineType" AS ENUM ('DAMAGE', 'FUEL', 'LATE', 'SALIK', 'VIOLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractInspectionAngle" AS ENUM ('FRONT', 'REAR', 'RIGHT_SIDE', 'LEFT_SIDE', 'FRONT_PLATE', 'REAR_PLATE', 'INTERIOR_ODOMETER', 'TIRES', 'LEFT', 'RIGHT', 'FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT', 'ODOMETER', 'DASHBOARD_FUEL', 'OTHER');

-- CreateEnum
CREATE TYPE "StripeWebhookProcessingStatus" AS ENUM ('RECEIVED', 'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "ContractPaymentAllocationPurpose" AS ENUM ('RECONCILIATION', 'RENEWAL');

-- CreateEnum
CREATE TYPE "FinancialLedgerKind" AS ENUM ('RENTAL_PAYMENT', 'RENEWAL_PAYMENT', 'RECONCILIATION_PAYMENT', 'POST_CLOSE_RECEIVABLE_PAYMENT', 'ROAD_LIABILITY_PAYMENT', 'MAINTENANCE_EXPENSE', 'MANUAL_EXPENSE', 'MANUAL_EXPENSE_REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialLedgerSourceType" AS ENUM ('CONTRACT_PAYMENT', 'MAINTENANCE_ORDER', 'MANUAL_EXPENSE');

-- CreateEnum
CREATE TYPE "ManualExpenseCategory" AS ENUM ('VEHICLE_CLEANING', 'FUEL', 'PARKING', 'GOVERNMENT_FEES', 'OFFICE_ADMIN', 'MARKETING', 'OPERATIONS', 'OTHER');

-- CreateEnum
CREATE TYPE "ManualExpenseStatus" AS ENUM ('ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "GpsMotionState" AS ENUM ('UNKNOWN', 'MOVING', 'PARKED');

-- CreateEnum
CREATE TYPE "ImportSourceType" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('UPLOADED', 'MAPPING_REQUIRED', 'VALIDATING', 'READY', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowResultStatus" AS ENUM ('IMPORTED', 'UPDATED', 'SKIPPED', 'FAILED', 'NEEDS_MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('RENTAL', 'RECONCILIATION', 'ROAD_LIABILITY', 'RENEWAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceLineType" AS ENUM ('RENTAL', 'RECONCILIATION_DAMAGE', 'RECONCILIATION_FUEL', 'RECONCILIATION_LATE', 'RECONCILIATION_OTHER', 'ROAD_LIABILITY_TRAFFIC', 'ROAD_LIABILITY_SALIK', 'ROAD_LIABILITY_OTHER', 'RENEWAL');

-- CreateEnum
CREATE TYPE "InvoiceSourceType" AS ENUM ('CONTRACT_RENTAL', 'CONTRACT_RENEWAL', 'RECONCILIATION_LINE', 'ROAD_LIABILITY_CUSTOMER_CHARGE');

-- CreateEnum
CREATE TYPE "InvoiceDeliveryChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "InvoiceDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "MaintenanceOrderStatus" AS ENUM ('SCHEDULED', 'IN_SERVICE', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('MECHANICAL', 'ELECTRICAL', 'TIRES', 'AIR_CONDITIONING', 'BODY', 'PERIODIC', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "VehicleOperationalStatus" AS ENUM ('AVAILABLE', 'RENTED', 'SERVICE');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('STRIPE');

-- CreateEnum
CREATE TYPE "CustomerPaymentMethodStatus" AS ENUM ('ACTIVE', 'REVOKED');

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
CREATE TYPE "RoadLiabilityType" AS ENUM ('RTA_VIOLATION', 'SALIK_TOLL', 'SALIK_VIOLATION');

-- CreateEnum
CREATE TYPE "StaffRoadChargeCategory" AS ENUM ('TRAFFIC_VIOLATION', 'SALIK');

-- CreateEnum
CREATE TYPE "RoadLiabilityConfirmationStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RoadLiabilityAttributionStatus" AS ENUM ('UNRESOLVED', 'MATCHED', 'UNMATCHED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "RoadLiabilityCollectionStatus" AS ENUM ('NOT_READY', 'OPEN', 'SETTLED', 'DISPUTED', 'VOID');

-- CreateEnum
CREATE TYPE "RoadLiabilityConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RoadLiabilityCustomerChargeDestination" AS ENUM ('RECONCILIATION', 'POST_CLOSE_RECEIVABLE', 'DIRECT_COLLECTION');

-- CreateEnum
CREATE TYPE "RoadLiabilityCollectionOperationalState" AS ENUM ('COLLECTIBLE', 'PROCESSING', 'PAID', 'FAILED', 'REQUIRES_ACTION', 'MANUAL_PENDING', 'PAYMENT_LINK_READY');

-- CreateEnum
CREATE TYPE "RoadLiabilitySettlementChannel" AS ENUM ('OFF_SESSION', 'CHECKOUT', 'MANUAL', 'CASH');

-- CreateEnum
CREATE TYPE "RoadLiabilityManualCollectionStatus" AS ENUM ('PENDING_RECEIPT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ContractPostCloseReceivableStatus" AS ENUM ('OPEN', 'SETTLED', 'VOID');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "TarsOperationType" AS ENUM ('CREATE_RENTAL', 'UPDATE_RENTAL', 'RETURN_RENTAL', 'SETTLE_RENTAL', 'REGISTER_CONTRACT', 'CONTRACT_ACCEPTANCE', 'HANDOVER', 'RETURN_DOCUMENTATION', 'COMPLETE_CONTRACT');

-- CreateEnum
CREATE TYPE "TarsOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUBMITTING', 'PENDING_PROVIDER', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TarsVehicleSyncStatus" AS ENUM ('NOT_STARTED', 'SUBMITTING', 'PENDING_PROVIDER', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "TarsOtpVerificationStatus" AS ENUM ('REQUESTED', 'VERIFIED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppProvider" AS ENUM ('META_CLOUD_API', 'ULTRAMSG', 'WHAPI');

-- CreateEnum
CREATE TYPE "WhatsAppProviderSessionStatus" AS ENUM ('INITIALIZING', 'QR_REQUIRED', 'RETRYING', 'LOADING', 'AUTHENTICATED', 'DISCONNECTED', 'STANDBY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'LINKING', 'LINKED', 'REAUTH_REQUIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionAttemptStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'SELECTED', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WhatsAppConnectionWebhookStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventType" AS ENUM ('MESSAGE_RECEIVED', 'MESSAGE_STATUS', 'TEMPLATE_STATUS', 'ACCOUNT_EVENT', 'PHONE_EVENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WhatsAppMessageType" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'LOCATION', 'CONTACTS', 'INTERACTIVE', 'REACTION', 'STICKER', 'TEMPLATE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppMessageProviderStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "WhatsAppMessageSendState" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "archive_sync_state" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "runningStartedAt" TIMESTAMP(3),
    "runningByUserId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_rows" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "contractId" TEXT,
    "rowOrder" INTEGER NOT NULL,
    "kmIn" INTEGER,
    "km" INTEGER,
    "kmOut" INTEGER,
    "deliveryDate" DATE,
    "deliveryTime" TEXT,
    "returnDate" DATE,
    "returnTime" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "description" TEXT,
    "days" INTEGER,
    "dailyRate" INTEGER,
    "rentalTotal" INTEGER,
    "salik" INTEGER,
    "parking" INTEGER,
    "fuel" INTEGER,
    "blackPoints" INTEGER,
    "fines" INTEGER,
    "total" INTEGER,
    "dollar" INTEGER,
    "cash" INTEGER,
    "visa" INTEGER,
    "transfer" INTEGER,
    "remaining" INTEGER,
    "manual_overrides" JSONB NOT NULL DEFAULT '{}',
    "manual_cell_values" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_rows_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "contract_number_sequences" (
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contract_number_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'AWAITING',
    "vehicleId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "assignedEmployeeUserId" INTEGER,
    "collectionMode" "RentalCollectionMode",
    "collectionModeSelectedAt" TIMESTAMP(3),
    "collectionModeSelectedByUserId" INTEGER,
    "priceType" "ContractPriceType" NOT NULL,
    "rentalDays" INTEGER NOT NULL,
    "durationValue" INTEGER NOT NULL,
    "durationUnit" "ContractDurationUnit" NOT NULL,
    "agreedAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "depositAmount" INTEGER,
    "snapshot" JSONB,
    "termsVersion" TEXT NOT NULL DEFAULT 'diamond-rental-terms-v1',
    "activatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_card_payment_methods" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "stripeCustomerId" TEXT,
    "stripePaymentMethodId" TEXT,
    "cardBrand" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "futureUseConsentPaymentId" TEXT,
    "futureUseAuthorizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_card_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_links" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "ContractLinkType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,

    CONSTRAINT "contract_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_acceptances" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "termsVersion" TEXT NOT NULL,
    "signatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "purpose" "ContractPaymentPurpose" NOT NULL DEFAULT 'RENTAL',
    "targetId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "method" "ContractPaymentMethod" NOT NULL,
    "status" "ContractPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "externalReference" TEXT,
    "provider" TEXT,
    "providerReference" TEXT,
    "providerStatus" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "statusTokenHash" TEXT,
    "statusTokenExpiresAt" TIMESTAMP(3),
    "savePaymentMethodForFutureUse" BOOLEAN NOT NULL DEFAULT false,
    "futureUseConsentAt" TIMESTAMP(3),
    "futureUseConsentVersion" TEXT,
    "futureUseConsentLocale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" INTEGER,

    CONSTRAINT "contract_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_off_session_attempts" (
    "id" TEXT NOT NULL,
    "contractPaymentId" TEXT NOT NULL,
    "customerChargeId" TEXT NOT NULL,
    "authorizationId" TEXT NOT NULL,
    "customerPaymentMethodId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountKey" TEXT,
    "livemode" BOOLEAN NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerReference" TEXT,
    "status" "ContractPaymentOffSessionAttemptStatus" NOT NULL DEFAULT 'PREPARING',
    "failureCode" TEXT,
    "declineCode" TEXT,
    "requiresAction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "contract_payment_off_session_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_attempts" (
    "id" TEXT NOT NULL,
    "contractPaymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "providerAccountKey" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "purpose" "ContractPaymentPurpose" NOT NULL,
    "contractId" TEXT NOT NULL,
    "companyCode" TEXT,
    "locale" TEXT NOT NULL,
    "savePaymentMethodForFutureUse" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT,
    "statusTokenHash" TEXT NOT NULL,
    "successUrl" TEXT NOT NULL,
    "cancelUrl" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" "ContractPaymentAttemptStatus" NOT NULL DEFAULT 'PREPARING',
    "providerReference" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventKind" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" "StripeWebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
    "paymentId" TEXT,
    "providerReference" TEXT,
    "normalizedStatus" TEXT,
    "amountMinor" INTEGER,
    "currency" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "error" TEXT,
    "lastErrorCode" TEXT,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_authorizations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "customerPaymentMethodId" TEXT NOT NULL,
    "sourcePaymentId" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentLocale" TEXT NOT NULL,
    "consentTextHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_payment_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_documents" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "type" "ContractDocumentType" NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driving_license_verifications" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" "DrivingLicenseVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "licenseNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "providerVersion" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "extractionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driving_license_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driving_license_extractions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" "DrivingLicenseExtractionStatus" NOT NULL DEFAULT 'PROCESSING',
    "engineDocumentStatus" TEXT,
    "jobId" TEXT,
    "provider" TEXT,
    "providerVersion" TEXT,
    "licenseNumber" TEXT,
    "holderNameEn" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "placeOfIssue" TEXT,
    "fieldsMeta" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driving_license_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passport_extractions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "status" "PassportExtractionStatus" NOT NULL DEFAULT 'PROCESSING',
    "fullName" TEXT,
    "firstName" TEXT,
    "middleName" TEXT,
    "lastName" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "passportIssueDate" TIMESTAMP(3),
    "passportExpiryDate" TIMESTAMP(3),
    "dateOfBirth" TIMESTAMP(3),
    "sex" TEXT,
    "issuingCountry" TEXT,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT,
    "providerVersion" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "passport_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_contract_review_drafts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "hirerName" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "address" TEXT,
    "telephone" TEXT,
    "additionalDriverName" TEXT,
    "additionalDriverNationality" TEXT,
    "additionalDriverLicenseNumber" TEXT,
    "sponsorName" TEXT,
    "sponsorIdNumber" TEXT,
    "cardNumberLast4" TEXT,
    "damageOut" JSONB,
    "damageIn" JSONB,
    "plateCode" TEXT,
    "contractNotes" TEXT,
    "includedKmPerDay" INTEGER,
    "extraKmRate" DECIMAL(10,2),
    "reviewedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_contract_review_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_contract_signatures" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "slot" "OfficialContractSignatureSlot" NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_contract_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_outs" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "performedByUserId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "mileageOut" INTEGER NOT NULL,
    "fuelOut" TEXT NOT NULL,
    "notes" TEXT,
    "vehicleId" INTEGER,
    "damageOut" JSONB,
    "hirerSignatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_out_drafts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "mileageOut" INTEGER,
    "fuelOut" TEXT,
    "damageOut" JSONB,
    "notes" TEXT,
    "hirerSignatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_car_out_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_out_draft_photos" (
    "id" TEXT NOT NULL,
    "carOutDraftId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_out_draft_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_out_photos" (
    "id" TEXT NOT NULL,
    "carOutId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_out_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_in_drafts" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "mileageIn" INTEGER,
    "fuelIn" TEXT,
    "damageIn" JSONB,
    "notes" TEXT,
    "hirerSignatureAttachmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_car_in_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_in_draft_photos" (
    "id" TEXT NOT NULL,
    "carInDraftId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_in_draft_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_ins" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "performedByUserId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "mileageIn" INTEGER NOT NULL,
    "fuelIn" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_car_in_photos" (
    "id" TEXT NOT NULL,
    "carInId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "angle" "ContractInspectionAngle" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_car_in_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_reconciliations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "chargesTotal" INTEGER NOT NULL,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "deductions" INTEGER NOT NULL DEFAULT 0,
    "finalAmount" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" INTEGER,
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" INTEGER,
    "settledAt" TIMESTAMP(3),
    "settledPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_reconciliation_lines" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "type" "ContractReconciliationLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "externalReference" TEXT,
    "sourceDomain" TEXT,
    "roadLiabilityId" TEXT,
    "officialAmountSnapshot" INTEGER,
    "adjustmentAmount" INTEGER,
    "adjustmentReason" TEXT,
    "adjustmentNote" TEXT,
    "confirmedByUserId" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_reconciliation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_renewals" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "additionalDays" INTEGER NOT NULL,
    "additionalDurationValue" INTEGER NOT NULL,
    "additionalDurationUnit" "ContractDurationUnit" NOT NULL DEFAULT 'DAY',
    "additionalAmount" INTEGER NOT NULL,
    "previousEndAt" TIMESTAMP(3) NOT NULL,
    "newEndAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "settledPaymentId" TEXT,
    "createdByUserId" INTEGER,

    CONSTRAINT "contract_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_payment_allocations" (
    "id" TEXT NOT NULL,
    "contractPaymentId" TEXT NOT NULL,
    "allocationPurpose" "ContractPaymentAllocationPurpose" NOT NULL,
    "targetId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "type" "CustomerDocumentType" NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "kind" "FinancialLedgerKind" NOT NULL,
    "sourceType" "FinancialLedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "contractId" TEXT,
    "customerId" INTEGER,
    "vehicleId" INTEGER,
    "contractPaymentId" TEXT,
    "maintenanceOrderId" INTEGER,
    "manualExpenseId" TEXT,
    "companyId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_expenses" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "category" "ManualExpenseCategory" NOT NULL,
    "recognizedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "vehicleId" INTEGER,
    "companyId" INTEGER,
    "vendorName" TEXT,
    "receiptNumber" TEXT,
    "attachmentId" TEXT,
    "note" TEXT,
    "status" "ManualExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "correctionOfExpenseId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" INTEGER,
    "voidReason" TEXT,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_expense_revisions" (
    "id" TEXT NOT NULL,
    "manualExpenseId" TEXT NOT NULL,
    "changedByUserId" INTEGER NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "manual_expense_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_provider_accounts" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "companyScopeId" INTEGER,
    "config" JSONB,
    "secretEncrypted" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "lastDeviceCount" INTEGER,
    "syncLeaseOwner" TEXT,
    "syncLeaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gps_provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gps_bindings" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "externalDeviceUid" TEXT,
    "deviceType" TEXT,
    "providerDeviceTypeId" TEXT,
    "simNumber" TEXT,
    "installationType" TEXT,
    "installationDate" TIMESTAMP(3),
    "subscriptionExpiresAt" TIMESTAMP(3),
    "providerDeviceExtras" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_gps_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gps_binding_histories" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "externalDeviceId" TEXT NOT NULL,
    "externalDeviceUid" TEXT,
    "endedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_gps_binding_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_gps_latest_states" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "bindingId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(11,7) NOT NULL,
    "speedKph" DECIMAL(8,3),
    "headingDegrees" DECIMAL(6,2),
    "accuracyMeters" DECIMAL(8,2),
    "motionState" "GpsMotionState" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "sourceEventId" TEXT,
    "previousLatitude" DECIMAL(10,7),
    "previousLongitude" DECIMAL(11,7),
    "ignitionOn" BOOLEAN,
    "providerDeviceState" TEXT,
    "addressLine" VARCHAR(512),
    "satelliteCount" INTEGER,
    "fuelLevel" DECIMAL(12,4),
    "fuelUnit" TEXT,
    "batteryLevel" DECIMAL(12,4),
    "batteryUnit" TEXT,
    "isCharging" BOOLEAN,
    "parkingEnabled" BOOLEAN,
    "immobilizerCapable" BOOLEAN,
    "providerUpdatedAt" TIMESTAMP(3),
    "odometerValue" DECIMAL(18,4),
    "odometerUnit" TEXT,
    "distanceTodayValue" DECIMAL(18,4),
    "distanceTodayUnit" TEXT,
    "providerExtras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_gps_latest_states_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "invoiceType" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "companyId" INTEGER NOT NULL,
    "contractId" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "termsSnapshot" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "customerNameSnapshot" TEXT NOT NULL,
    "contractNumberSnapshot" TEXT NOT NULL,
    "vehicleNameSnapshot" TEXT NOT NULL,
    "plateNumberSnapshot" TEXT NOT NULL,
    "companyDisplayNameSnapshot" TEXT NOT NULL,
    "companyAddressSnapshot" TEXT,
    "companyEmailSnapshot" TEXT,
    "companyBrandKeySnapshot" TEXT NOT NULL,
    "subtotalAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "balanceDueSnapshot" INTEGER NOT NULL,
    "templateVersion" TEXT NOT NULL DEFAULT 'v1',
    "originEventKey" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "supersedesInvoiceId" TEXT,
    "contentFingerprint" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "lineType" "InvoiceLineType" NOT NULL,
    "serviceLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitRate" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "sourceType" "InvoiceSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_deliveries" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "channel" "InvoiceDeliveryChannel" NOT NULL,
    "status" "InvoiceDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "recipientPhoneSnapshot" TEXT NOT NULL,
    "recipientNameSnapshot" TEXT,
    "messageSnapshot" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "requestedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_number_sequences" (
    "companyId" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL,
    "configuredAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_number_sequences_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "maintenance_orders" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "status" "MaintenanceOrderStatus" NOT NULL,
    "maintenanceType" "MaintenanceType" NOT NULL,
    "issueDescription" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "workshopName" TEXT,
    "odometerIn" INTEGER,
    "expectedCompletionAt" TIMESTAMP(3),
    "notes" TEXT,
    "cost" INTEGER,
    "createdByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operating_companies" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "legalNameAr" TEXT NOT NULL,
    "legalNameEn" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_companies_pkey" PRIMARY KEY ("id")
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
    "nationality" TEXT,
    "identityNumber" TEXT,
    "passportNumber" TEXT,
    "drivingLicenseNumber" TEXT,
    "drivingLicenseExpiry" TIMESTAMP(3),
    "dateOfBirth" TIMESTAMP(3),
    "drivingLicenseIssueDate" TIMESTAMP(3),
    "drivingLicensePlaceOfIssue" TEXT,
    "address" TEXT,
    "stripeCustomerId" TEXT,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "vin" TEXT,
    "vehicleName" TEXT,
    "modelId" INTEGER,
    "modelYear" INTEGER,
    "color" TEXT,
    "plateNumber" TEXT,
    "hourlyRate" INTEGER,
    "dailyRate" INTEGER,
    "weeklyRate" INTEGER,
    "monthlyRate" INTEGER,
    "operationalStatus" "VehicleOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_photos" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_photos_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "customer_payment_profiles" (
    "id" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL DEFAULT 'STRIPE',
    "providerAccountKey" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "providerCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payment_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment_methods" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "providerPaymentMethodId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CARD',
    "cardBrand" TEXT NOT NULL,
    "cardLast4" TEXT NOT NULL,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "status" "CustomerPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payment_methods_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "toll_gates" (
    "id" TEXT NOT NULL,
    "networkKey" TEXT NOT NULL,
    "externalGateCode" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "lineStartLatitude" DECIMAL(10,7) NOT NULL,
    "lineStartLongitude" DECIMAL(11,7) NOT NULL,
    "lineEndLatitude" DECIMAL(10,7) NOT NULL,
    "lineEndLongitude" DECIMAL(11,7) NOT NULL,
    "corridorMeters" DECIMAL(8,2) NOT NULL,
    "allowedHeadingDegrees" DECIMAL(6,2),
    "headingToleranceDegrees" DECIMAL(6,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "toll_gates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_liability_observations" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "authoritative" BOOLEAN NOT NULL,
    "externalEventId" TEXT,
    "ingestionFingerprint" TEXT NOT NULL,
    "eventType" "RoadLiabilityType" NOT NULL,
    "vehicleId" INTEGER,
    "plateNumberNormalized" TEXT,
    "externalVehicleRef" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER,
    "currency" TEXT,
    "externalReference" TEXT,
    "gateId" TEXT,
    "locationLabel" TEXT,
    "confidence" "RoadLiabilityConfidence",
    "liabilityId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_liability_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_liabilities" (
    "id" TEXT NOT NULL,
    "type" "RoadLiabilityType" NOT NULL,
    "vehicleId" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "gateId" TEXT,
    "locationLabel" TEXT,
    "amount" INTEGER,
    "currency" TEXT,
    "authoritativeSourceKey" TEXT,
    "authoritativeExternalReference" TEXT,
    "confirmationStatus" "RoadLiabilityConfirmationStatus" NOT NULL,
    "attributionStatus" "RoadLiabilityAttributionStatus" NOT NULL,
    "collectionStatus" "RoadLiabilityCollectionStatus" NOT NULL,
    "attributedContractId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "staffEnteredByUserId" INTEGER,
    "staffEnteredAt" TIMESTAMP(3),
    "staffChargeCategory" "StaffRoadChargeCategory",
    "staffChargeDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "road_liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_liability_customer_charges" (
    "id" TEXT NOT NULL,
    "roadLiabilityId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "destinationType" "RoadLiabilityCustomerChargeDestination" NOT NULL,
    "officialAmountSnapshot" INTEGER NOT NULL,
    "customerChargeAmount" INTEGER NOT NULL,
    "adjustmentAmount" INTEGER NOT NULL,
    "adjustmentReason" TEXT,
    "adjustmentNote" TEXT,
    "confirmedByUserId" INTEGER,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "reconciliationLineId" TEXT,
    "operationalState" "RoadLiabilityCollectionOperationalState",
    "settlementChannel" "RoadLiabilitySettlementChannel",
    "contractPaymentId" TEXT,
    "manualSelectedByUserId" INTEGER,
    "manualSelectedAt" TIMESTAMP(3),
    "manualConfirmedByUserId" INTEGER,
    "manualConfirmedAt" TIMESTAMP(3),
    "manualCollectionStatus" "RoadLiabilityManualCollectionStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "road_liability_customer_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_post_close_receivables" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "customerChargeId" TEXT NOT NULL,
    "roadLiabilityId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "ContractPostCloseReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "settledAt" TIMESTAMP(3),
    "settledPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_post_close_receivables_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "tars_contract_integrations" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "externalContractId" TEXT,
    "externalRentalDid" TEXT,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_contract_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tars_operations" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "operationType" "TarsOperationType" NOT NULL,
    "status" "TarsOperationStatus" NOT NULL DEFAULT 'SUBMITTING',
    "correlationSubject" TEXT,
    "idempotencyKey" TEXT,
    "requestFingerprint" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "providerRequestId" TEXT,
    "externalReference" TEXT,
    "providerOperationId" TEXT,
    "lastErrorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tars_vehicle_integrations" (
    "id" TEXT NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "externalVehicleDid" TEXT,
    "syncStatus" "TarsVehicleSyncStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_vehicle_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tars_attachment_uploads" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "externalUrl" TEXT,
    "externalHash" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_attachment_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tars_contract_otp_challenges" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "challengeReference" TEXT,
    "maskedDestination" TEXT,
    "status" "TarsOtpVerificationStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "resendAvailableAt" TIMESTAMP(3),
    "otpLength" INTEGER,
    "maxAttempts" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tars_contract_otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META_CLOUD_API',
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "businessAccountName" TEXT,
    "providerInstanceId" TEXT,
    "providerApiUrl" TEXT,
    "providerSessionStatus" "WhatsAppProviderSessionStatus",
    "providerSessionCheckedAt" TIMESTAMP(3),
    "webhookCallbackCiphertext" TEXT,
    "credentialCiphertext" TEXT,
    "credentialExpiresAt" TIMESTAMP(3),
    "connectedByUserId" INTEGER,
    "connectedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "disconnectedByUserId" INTEGER,
    "lastProviderErrorCode" TEXT,
    "webhookStatus" "WhatsAppConnectionWebhookStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "WhatsAppProvider" NOT NULL DEFAULT 'META_CLOUD_API',
    "providerEventKey" TEXT NOT NULL,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "eventType" "WhatsAppWebhookEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "status" "WhatsAppWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "failureCode" TEXT,
    "connectionId" TEXT,
    "providerMessageId" TEXT,
    "customerWaId" TEXT,
    "customerDisplayName" TEXT,
    "occurredAt" TIMESTAMP(3),
    "messageType" TEXT,
    "textBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "customerWaId" TEXT NOT NULL,
    "providerChatId" TEXT,
    "customerDisplayName" TEXT,
    "lastMessageId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "lastMessageType" "WhatsAppMessageType",
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "lastReadByUserId" INTEGER,
    "customerId" INTEGER,
    "customerLinkedAt" TIMESTAMP(3),
    "customerLinkedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "messageType" "WhatsAppMessageType" NOT NULL,
    "textBody" TEXT,
    "providerMediaId" TEXT,
    "caption" TEXT,
    "mediaMimeType" TEXT,
    "mediaFilename" TEXT,
    "mediaSizeBytes" INTEGER,
    "templateName" TEXT,
    "templateLanguage" TEXT,
    "templatePreview" TEXT,
    "displayPayload" JSONB,
    "providerOccurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "providerStatus" "WhatsAppMessageProviderStatus",
    "sentByUserId" INTEGER,
    "sendState" "WhatsAppMessageSendState",
    "webhookEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_connection_attempts" (
    "id" TEXT NOT NULL,
    "initiatedByUserId" INTEGER NOT NULL,
    "status" "WhatsAppConnectionAttemptStatus" NOT NULL DEFAULT 'PENDING',
    "stateNonceHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "temporaryCredentialCiphertext" TEXT,
    "temporaryCredentialExpiresAt" TIMESTAMP(3),
    "providerGrantMetadata" JSONB,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connection_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_outbound_attempts" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "actorUserId" INTEGER NOT NULL,
    "idempotencyKeyHash" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "state" "WhatsAppMessageSendState" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "safeProviderErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "whatsapp_outbound_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "archive_rows_contractId_key" ON "archive_rows"("contractId");

-- CreateIndex
CREATE INDEX "archive_rows_vehicleId_idx" ON "archive_rows"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "archive_rows_vehicleId_rowOrder_key" ON "archive_rows"("vehicleId", "rowOrder");

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
CREATE UNIQUE INDEX "contracts_contractNumber_key" ON "contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "contracts_vehicleId_status_idx" ON "contracts"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "contracts_companyId_idx" ON "contracts"("companyId");

-- CreateIndex
CREATE INDEX "contracts_customerId_idx" ON "contracts"("customerId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_createdAt_idx" ON "contracts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_card_payment_methods_contractId_key" ON "contract_card_payment_methods"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_card_payment_methods_stripePaymentMethodId_key" ON "contract_card_payment_methods"("stripePaymentMethodId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_card_payment_methods_futureUseConsentPaymentId_key" ON "contract_card_payment_methods"("futureUseConsentPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_links_tokenHash_key" ON "contract_links"("tokenHash");

-- CreateIndex
CREATE INDEX "contract_links_contractId_type_idx" ON "contract_links"("contractId", "type");

-- CreateIndex
CREATE INDEX "contract_links_expiresAt_idx" ON "contract_links"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_acceptances_contractId_key" ON "contract_acceptances"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payments_statusTokenHash_key" ON "contract_payments"("statusTokenHash");

-- CreateIndex
CREATE INDEX "contract_payments_contractId_status_idx" ON "contract_payments"("contractId", "status");

-- CreateIndex
CREATE INDEX "contract_payments_purpose_targetId_status_idx" ON "contract_payments"("purpose", "targetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_off_session_attempts_idempotencyKey_key" ON "contract_payment_off_session_attempts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_off_session_attempts_providerReference_key" ON "contract_payment_off_session_attempts"("providerReference");

-- CreateIndex
CREATE INDEX "contract_payment_off_session_attempts_contractPaymentId_sta_idx" ON "contract_payment_off_session_attempts"("contractPaymentId", "status");

-- CreateIndex
CREATE INDEX "contract_payment_off_session_attempts_customerChargeId_stat_idx" ON "contract_payment_off_session_attempts"("customerChargeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_attempts_statusTokenHash_key" ON "contract_payment_attempts"("statusTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_attempts_idempotencyKey_key" ON "contract_payment_attempts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_attempts_providerReference_key" ON "contract_payment_attempts"("providerReference");

-- CreateIndex
CREATE INDEX "contract_payment_attempts_contractPaymentId_status_idx" ON "contract_payment_attempts"("contractPaymentId", "status");

-- CreateIndex
CREATE INDEX "contract_payment_attempts_contractPaymentId_createdAt_idx" ON "contract_payment_attempts"("contractPaymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_stripeEventId_key" ON "stripe_webhook_events"("stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_receivedAt_idx" ON "stripe_webhook_events"("receivedAt");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_processingStatus_availableAt_idx" ON "stripe_webhook_events"("processingStatus", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_authorizations_contractId_key" ON "contract_payment_authorizations"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_authorizations_sourcePaymentId_key" ON "contract_payment_authorizations"("sourcePaymentId");

-- CreateIndex
CREATE INDEX "contract_payment_authorizations_customerId_idx" ON "contract_payment_authorizations"("customerId");

-- CreateIndex
CREATE INDEX "contract_payment_authorizations_customerPaymentMethodId_idx" ON "contract_payment_authorizations"("customerPaymentMethodId");

-- CreateIndex
CREATE INDEX "contract_documents_contractId_type_supersededAt_idx" ON "contract_documents"("contractId", "type", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "driving_license_verifications_extractionId_key" ON "driving_license_verifications"("extractionId");

-- CreateIndex
CREATE INDEX "driving_license_verifications_contractId_createdAt_idx" ON "driving_license_verifications"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "driving_license_extractions_documentId_key" ON "driving_license_extractions"("documentId");

-- CreateIndex
CREATE INDEX "driving_license_extractions_contractId_createdAt_idx" ON "driving_license_extractions"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "passport_extractions_documentId_key" ON "passport_extractions"("documentId");

-- CreateIndex
CREATE INDEX "passport_extractions_contractId_createdAt_idx" ON "passport_extractions"("contractId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "official_contract_review_drafts_contractId_key" ON "official_contract_review_drafts"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "official_contract_signatures_contractId_slot_key" ON "official_contract_signatures"("contractId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_outs_contractId_key" ON "contract_car_outs"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_drafts_contractId_key" ON "contract_car_out_drafts"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_draft_photos_carOutDraftId_angle_key" ON "contract_car_out_draft_photos"("carOutDraftId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_draft_photos_carOutDraftId_attachmentId_key" ON "contract_car_out_draft_photos"("carOutDraftId", "attachmentId");

-- CreateIndex
CREATE INDEX "contract_car_out_photos_carOutId_sortOrder_idx" ON "contract_car_out_photos"("carOutId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_photos_carOutId_angle_key" ON "contract_car_out_photos"("carOutId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_out_photos_carOutId_attachmentId_key" ON "contract_car_out_photos"("carOutId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_drafts_contractId_key" ON "contract_car_in_drafts"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_draft_photos_carInDraftId_angle_key" ON "contract_car_in_draft_photos"("carInDraftId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_draft_photos_carInDraftId_attachmentId_key" ON "contract_car_in_draft_photos"("carInDraftId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_ins_contractId_key" ON "contract_car_ins"("contractId");

-- CreateIndex
CREATE INDEX "contract_car_in_photos_carInId_sortOrder_idx" ON "contract_car_in_photos"("carInId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_photos_carInId_angle_key" ON "contract_car_in_photos"("carInId", "angle");

-- CreateIndex
CREATE UNIQUE INDEX "contract_car_in_photos_carInId_attachmentId_key" ON "contract_car_in_photos"("carInId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_reconciliations_contractId_key" ON "contract_reconciliations"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_reconciliations_settledPaymentId_key" ON "contract_reconciliations"("settledPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_reconciliation_lines_roadLiabilityId_key" ON "contract_reconciliation_lines"("roadLiabilityId");

-- CreateIndex
CREATE INDEX "contract_reconciliation_lines_reconciliationId_idx" ON "contract_reconciliation_lines"("reconciliationId");

-- CreateIndex
CREATE INDEX "contract_renewals_contractId_createdAt_idx" ON "contract_renewals"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "contract_renewals_settledPaymentId_idx" ON "contract_renewals"("settledPaymentId");

-- CreateIndex
CREATE INDEX "contract_payment_allocations_contractPaymentId_idx" ON "contract_payment_allocations"("contractPaymentId");

-- CreateIndex
CREATE INDEX "contract_payment_allocations_targetId_idx" ON "contract_payment_allocations"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_payment_allocations_contractPaymentId_allocationPu_key" ON "contract_payment_allocations"("contractPaymentId", "allocationPurpose", "targetId");

-- CreateIndex
CREATE INDEX "customer_documents_customerId_type_idx" ON "customer_documents"("customerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "customer_documents_customerId_attachmentId_key" ON "customer_documents"("customerId", "attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storageKey_key" ON "attachments"("storageKey");

-- CreateIndex
CREATE INDEX "attachments_uploadedById_idx" ON "attachments"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "financial_ledger_entries_dedupeKey_key" ON "financial_ledger_entries"("dedupeKey");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_occurredAt_idx" ON "financial_ledger_entries"("occurredAt");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_kind_idx" ON "financial_ledger_entries"("kind");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_sourceType_idx" ON "financial_ledger_entries"("sourceType");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_contractId_idx" ON "financial_ledger_entries"("contractId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_customerId_idx" ON "financial_ledger_entries"("customerId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_vehicleId_idx" ON "financial_ledger_entries"("vehicleId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_manualExpenseId_idx" ON "financial_ledger_entries"("manualExpenseId");

-- CreateIndex
CREATE INDEX "financial_ledger_entries_companyId_occurredAt_idx" ON "financial_ledger_entries"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "manual_expenses_recognizedAt_idx" ON "manual_expenses"("recognizedAt");

-- CreateIndex
CREATE INDEX "manual_expenses_status_idx" ON "manual_expenses"("status");

-- CreateIndex
CREATE INDEX "manual_expenses_category_idx" ON "manual_expenses"("category");

-- CreateIndex
CREATE INDEX "manual_expenses_vehicleId_idx" ON "manual_expenses"("vehicleId");

-- CreateIndex
CREATE INDEX "manual_expenses_createdByUserId_idx" ON "manual_expenses"("createdByUserId");

-- CreateIndex
CREATE INDEX "manual_expenses_companyId_idx" ON "manual_expenses"("companyId");

-- CreateIndex
CREATE INDEX "manual_expense_revisions_manualExpenseId_changedAt_idx" ON "manual_expense_revisions"("manualExpenseId", "changedAt");

-- CreateIndex
CREATE INDEX "manual_expense_revisions_changedByUserId_idx" ON "manual_expense_revisions"("changedByUserId");

-- CreateIndex
CREATE INDEX "gps_provider_accounts_companyScopeId_idx" ON "gps_provider_accounts"("companyScopeId");

-- CreateIndex
CREATE INDEX "gps_provider_accounts_enabled_idx" ON "gps_provider_accounts"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "gps_provider_accounts_providerKey_accountKey_key" ON "gps_provider_accounts"("providerKey", "accountKey");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_bindings_vehicleId_key" ON "vehicle_gps_bindings"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_gps_bindings_providerKey_externalDeviceId_idx" ON "vehicle_gps_bindings"("providerKey", "externalDeviceId");

-- CreateIndex
CREATE INDEX "vehicle_gps_bindings_providerAccountId_isActive_idx" ON "vehicle_gps_bindings"("providerAccountId", "isActive");

-- CreateIndex
CREATE INDEX "vehicle_gps_bindings_isActive_idx" ON "vehicle_gps_bindings"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_bindings_active_device_key" ON "vehicle_gps_bindings"("providerAccountId", "externalDeviceId") WHERE ("isActive" = true);

-- CreateIndex
CREATE INDEX "vehicle_gps_binding_histories_vehicleId_idx" ON "vehicle_gps_binding_histories"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_gps_binding_histories_providerAccountId_idx" ON "vehicle_gps_binding_histories"("providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_latest_states_vehicleId_key" ON "vehicle_gps_latest_states"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_latest_states_bindingId_key" ON "vehicle_gps_latest_states"("bindingId");

-- CreateIndex
CREATE INDEX "vehicle_gps_latest_states_capturedAt_idx" ON "vehicle_gps_latest_states"("capturedAt");

-- CreateIndex
CREATE INDEX "vehicle_gps_latest_states_motionState_idx" ON "vehicle_gps_latest_states"("motionState");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_gps_latest_states_bindingId_sourceEventId_key" ON "vehicle_gps_latest_states"("bindingId", "sourceEventId");

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
CREATE UNIQUE INDEX "invoices_originEventKey_key" ON "invoices"("originEventKey");

-- CreateIndex
CREATE INDEX "invoices_contractId_idx" ON "invoices"("contractId");

-- CreateIndex
CREATE INDEX "invoices_contractId_isCurrent_idx" ON "invoices"("contractId", "isCurrent");

-- CreateIndex
CREATE INDEX "invoices_vehicleId_idx" ON "invoices"("vehicleId");

-- CreateIndex
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");

-- CreateIndex
CREATE INDEX "invoices_companyId_issueDate_idx" ON "invoices"("companyId", "issueDate");

-- CreateIndex
CREATE INDEX "invoices_invoiceType_idx" ON "invoices"("invoiceType");

-- CreateIndex
CREATE INDEX "invoices_createdAt_idx" ON "invoices"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_invoiceNumber_key" ON "invoices"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_contractId_one_current_idx" ON "invoices"("contractId") WHERE ("isCurrent" = true);

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_position_idx" ON "invoice_lines"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoiceId_sourceType_sourceId_key" ON "invoice_lines"("invoiceId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_deliveries_idempotencyKey_key" ON "invoice_deliveries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "invoice_deliveries_invoiceId_createdAt_idx" ON "invoice_deliveries"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "invoice_deliveries_status_idx" ON "invoice_deliveries"("status");

-- CreateIndex
CREATE INDEX "invoice_deliveries_providerMessageId_idx" ON "invoice_deliveries"("providerMessageId");

-- CreateIndex
CREATE INDEX "maintenance_orders_vehicleId_idx" ON "maintenance_orders"("vehicleId");

-- CreateIndex
CREATE INDEX "maintenance_orders_status_idx" ON "maintenance_orders"("status");

-- CreateIndex
CREATE INDEX "maintenance_orders_scheduledAt_idx" ON "maintenance_orders"("scheduledAt");

-- CreateIndex
CREATE INDEX "maintenance_orders_expectedCompletionAt_idx" ON "maintenance_orders"("expectedCompletionAt");

-- CreateIndex
CREATE INDEX "maintenance_orders_completedAt_idx" ON "maintenance_orders"("completedAt");

-- CreateIndex
CREATE INDEX "maintenance_orders_createdByUserId_idx" ON "maintenance_orders"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "operating_companies_code_key" ON "operating_companies"("code");

-- CreateIndex
CREATE INDEX "operating_companies_isActive_idx" ON "operating_companies"("isActive");

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
CREATE UNIQUE INDEX "customers_stripeCustomerId_key" ON "customers"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "customers_mobile_idx" ON "customers"("mobile");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "customers"("email");

-- CreateIndex
CREATE INDEX "customers_identityNumber_idx" ON "customers"("identityNumber");

-- CreateIndex
CREATE INDEX "customers_passportNumber_idx" ON "customers"("passportNumber");

-- CreateIndex
CREATE INDEX "customers_drivingLicenseNumber_idx" ON "customers"("drivingLicenseNumber");

-- CreateIndex
CREATE INDEX "customers_isActive_idx" ON "customers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_key" ON "vehicles"("plateNumber");

-- CreateIndex
CREATE INDEX "vehicles_companyId_idx" ON "vehicles"("companyId");

-- CreateIndex
CREATE INDEX "vehicles_modelId_idx" ON "vehicles"("modelId");

-- CreateIndex
CREATE INDEX "vehicles_isActive_idx" ON "vehicles"("isActive");

-- CreateIndex
CREATE INDEX "vehicles_operationalStatus_idx" ON "vehicles"("operationalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_companyId_externalId_key" ON "vehicles"("companyId", "externalId");

-- CreateIndex
CREATE INDEX "vehicle_photos_vehicleId_sortOrder_idx" ON "vehicle_photos"("vehicleId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_photos_vehicleId_attachmentId_key" ON "vehicle_photos"("vehicleId", "attachmentId");

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
CREATE INDEX "customer_payment_profiles_providerCustomerId_idx" ON "customer_payment_profiles"("providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_profiles_customerId_provider_providerAccou_key" ON "customer_payment_profiles"("customerId", "provider", "providerAccountKey", "livemode");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_profiles_provider_providerAccountKey_livem_key" ON "customer_payment_profiles"("provider", "providerAccountKey", "livemode", "providerCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_methods_profileId_providerPaymentMethodId_key" ON "customer_payment_methods"("profileId", "providerPaymentMethodId");

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
CREATE INDEX "toll_gates_networkKey_isActive_idx" ON "toll_gates"("networkKey", "isActive");

-- CreateIndex
CREATE INDEX "toll_gates_externalGateCode_idx" ON "toll_gates"("externalGateCode");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_observations_ingestionFingerprint_key" ON "road_liability_observations"("ingestionFingerprint");

-- CreateIndex
CREATE INDEX "road_liability_observations_sourceKey_occurredAt_idx" ON "road_liability_observations"("sourceKey", "occurredAt");

-- CreateIndex
CREATE INDEX "road_liability_observations_vehicleId_gateId_occurredAt_idx" ON "road_liability_observations"("vehicleId", "gateId", "occurredAt");

-- CreateIndex
CREATE INDEX "road_liability_observations_liabilityId_idx" ON "road_liability_observations"("liabilityId");

-- CreateIndex
CREATE INDEX "road_liability_observations_eventType_occurredAt_idx" ON "road_liability_observations"("eventType", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_observations_sourceKey_externalEventId_key" ON "road_liability_observations"("sourceKey", "externalEventId");

-- CreateIndex
CREATE INDEX "road_liabilities_occurredAt_idx" ON "road_liabilities"("occurredAt");

-- CreateIndex
CREATE INDEX "road_liabilities_type_idx" ON "road_liabilities"("type");

-- CreateIndex
CREATE INDEX "road_liabilities_confirmationStatus_idx" ON "road_liabilities"("confirmationStatus");

-- CreateIndex
CREATE INDEX "road_liabilities_attributionStatus_idx" ON "road_liabilities"("attributionStatus");

-- CreateIndex
CREATE INDEX "road_liabilities_collectionStatus_idx" ON "road_liabilities"("collectionStatus");

-- CreateIndex
CREATE INDEX "road_liabilities_vehicleId_occurredAt_idx" ON "road_liabilities"("vehicleId", "occurredAt");

-- CreateIndex
CREATE INDEX "road_liabilities_attributedContractId_idx" ON "road_liabilities"("attributedContractId");

-- CreateIndex
CREATE INDEX "road_liabilities_authoritativeSourceKey_idx" ON "road_liabilities"("authoritativeSourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_customer_charges_roadLiabilityId_key" ON "road_liability_customer_charges"("roadLiabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_customer_charges_reconciliationLineId_key" ON "road_liability_customer_charges"("reconciliationLineId");

-- CreateIndex
CREATE UNIQUE INDEX "road_liability_customer_charges_contractPaymentId_key" ON "road_liability_customer_charges"("contractPaymentId");

-- CreateIndex
CREATE INDEX "road_liability_customer_charges_contractId_idx" ON "road_liability_customer_charges"("contractId");

-- CreateIndex
CREATE INDEX "road_liability_customer_charges_operationalState_idx" ON "road_liability_customer_charges"("operationalState");

-- CreateIndex
CREATE UNIQUE INDEX "contract_post_close_receivables_customerChargeId_key" ON "contract_post_close_receivables"("customerChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_post_close_receivables_roadLiabilityId_key" ON "contract_post_close_receivables"("roadLiabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_post_close_receivables_settledPaymentId_key" ON "contract_post_close_receivables"("settledPaymentId");

-- CreateIndex
CREATE INDEX "contract_post_close_receivables_contractId_status_idx" ON "contract_post_close_receivables"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "settings_scope_idx" ON "settings"("scope");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "tars_contract_integrations_contractId_key" ON "tars_contract_integrations"("contractId");

-- CreateIndex
CREATE INDEX "tars_contract_integrations_externalContractId_idx" ON "tars_contract_integrations"("externalContractId");

-- CreateIndex
CREATE INDEX "tars_contract_integrations_externalRentalDid_idx" ON "tars_contract_integrations"("externalRentalDid");

-- CreateIndex
CREATE INDEX "tars_operations_contractId_operationType_createdAt_idx" ON "tars_operations"("contractId", "operationType", "createdAt");

-- CreateIndex
CREATE INDEX "tars_operations_contractId_operationType_correlationSubject_idx" ON "tars_operations"("contractId", "operationType", "correlationSubject");

-- CreateIndex
CREATE INDEX "tars_operations_integrationId_status_idx" ON "tars_operations"("integrationId", "status");

-- CreateIndex
CREATE INDEX "tars_operations_providerRequestId_idx" ON "tars_operations"("providerRequestId");

-- CreateIndex
CREATE INDEX "tars_vehicle_integrations_companyId_externalVehicleDid_idx" ON "tars_vehicle_integrations"("companyId", "externalVehicleDid");

-- CreateIndex
CREATE UNIQUE INDEX "tars_vehicle_integrations_vehicleId_companyId_key" ON "tars_vehicle_integrations"("vehicleId", "companyId");

-- CreateIndex
CREATE INDEX "tars_attachment_uploads_companyId_idx" ON "tars_attachment_uploads"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "tars_attachment_uploads_attachmentId_companyId_key" ON "tars_attachment_uploads"("attachmentId", "companyId");

-- CreateIndex
CREATE INDEX "tars_contract_otp_challenges_contractId_createdAt_idx" ON "tars_contract_otp_challenges"("contractId", "createdAt");

-- CreateIndex
CREATE INDEX "tars_contract_otp_challenges_contractId_status_idx" ON "tars_contract_otp_challenges"("contractId", "status");

-- CreateIndex
CREATE INDEX "whatsapp_connections_status_idx" ON "whatsapp_connections"("status");

-- CreateIndex
CREATE INDEX "whatsapp_connections_wabaId_phoneNumberId_idx" ON "whatsapp_connections"("wabaId", "phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_webhook_events_providerEventKey_key" ON "whatsapp_webhook_events"("providerEventKey");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_connectionId_receivedAt_idx" ON "whatsapp_webhook_events"("connectionId", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_status_receivedAt_idx" ON "whatsapp_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "whatsapp_webhook_events_wabaId_phoneNumberId_idx" ON "whatsapp_webhook_events"("wabaId", "phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_connectionId_providerChatId_idx" ON "whatsapp_conversations"("connectionId", "providerChatId");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_lastMessageAt_idx" ON "whatsapp_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_unreadCount_idx" ON "whatsapp_conversations"("unreadCount");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_customerDisplayName_idx" ON "whatsapp_conversations"("customerDisplayName");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_customerId_idx" ON "whatsapp_conversations"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_connectionId_customerWaId_key" ON "whatsapp_conversations"("connectionId", "customerWaId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_providerOccurredAt_idx" ON "whatsapp_messages"("conversationId", "providerOccurredAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversationId_createdAt_idx" ON "whatsapp_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_connectionId_providerMessageId_key" ON "whatsapp_messages"("connectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_attempts_stateNonceHash_key" ON "whatsapp_connection_attempts"("stateNonceHash");

-- CreateIndex
CREATE INDEX "whatsapp_connection_attempts_initiatedByUserId_createdAt_idx" ON "whatsapp_connection_attempts"("initiatedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_connection_attempts_status_expiresAt_idx" ON "whatsapp_connection_attempts"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_outbound_attempts_messageId_key" ON "whatsapp_outbound_attempts"("messageId");

-- CreateIndex
CREATE INDEX "whatsapp_outbound_attempts_conversationId_createdAt_idx" ON "whatsapp_outbound_attempts"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_outbound_attempts_actorUserId_idempotencyKeyHash_key" ON "whatsapp_outbound_attempts"("actorUserId", "idempotencyKeyHash");

-- AddForeignKey
ALTER TABLE "archive_rows" ADD CONSTRAINT "archive_rows_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_rows" ADD CONSTRAINT "archive_rows_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_assignedEmployeeUserId_fkey" FOREIGN KEY ("assignedEmployeeUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_collectionModeSelectedByUserId_fkey" FOREIGN KEY ("collectionModeSelectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_card_payment_methods" ADD CONSTRAINT "contract_card_payment_methods_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_links" ADD CONSTRAINT "contract_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_signatureAttachmentId_fkey" FOREIGN KEY ("signatureAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payments" ADD CONSTRAINT "contract_payments_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_off_session_attempts" ADD CONSTRAINT "contract_payment_off_session_attempts_contractPaymentId_fkey" FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_off_session_attempts" ADD CONSTRAINT "contract_payment_off_session_attempts_customerChargeId_fkey" FOREIGN KEY ("customerChargeId") REFERENCES "road_liability_customer_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_off_session_attempts" ADD CONSTRAINT "contract_payment_off_session_attempts_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "contract_payment_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_off_session_attempts" ADD CONSTRAINT "contract_payment_off_session_attempts_customerPaymentMetho_fkey" FOREIGN KEY ("customerPaymentMethodId") REFERENCES "customer_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_attempts" ADD CONSTRAINT "contract_payment_attempts_contractPaymentId_fkey" FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_customerPaymentMethodId_fkey" FOREIGN KEY ("customerPaymentMethodId") REFERENCES "customer_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_authorizations" ADD CONSTRAINT "contract_payment_authorizations_sourcePaymentId_fkey" FOREIGN KEY ("sourcePaymentId") REFERENCES "contract_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_documents" ADD CONSTRAINT "contract_documents_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_verifications" ADD CONSTRAINT "driving_license_verifications_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_verifications" ADD CONSTRAINT "driving_license_verifications_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_verifications" ADD CONSTRAINT "driving_license_verifications_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "driving_license_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_extractions" ADD CONSTRAINT "driving_license_extractions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driving_license_extractions" ADD CONSTRAINT "driving_license_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_extractions" ADD CONSTRAINT "passport_extractions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passport_extractions" ADD CONSTRAINT "passport_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "contract_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_contract_review_drafts" ADD CONSTRAINT "official_contract_review_drafts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_contract_signatures" ADD CONSTRAINT "official_contract_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_contract_signatures" ADD CONSTRAINT "official_contract_signatures_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_outs" ADD CONSTRAINT "contract_car_outs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_outs" ADD CONSTRAINT "contract_car_outs_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_outs" ADD CONSTRAINT "contract_car_outs_hirerSignatureAttachmentId_fkey" FOREIGN KEY ("hirerSignatureAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_drafts" ADD CONSTRAINT "contract_car_out_drafts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_drafts" ADD CONSTRAINT "contract_car_out_drafts_hirerSignatureAttachmentId_fkey" FOREIGN KEY ("hirerSignatureAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_draft_photos" ADD CONSTRAINT "contract_car_out_draft_photos_carOutDraftId_fkey" FOREIGN KEY ("carOutDraftId") REFERENCES "contract_car_out_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_draft_photos" ADD CONSTRAINT "contract_car_out_draft_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_photos" ADD CONSTRAINT "contract_car_out_photos_carOutId_fkey" FOREIGN KEY ("carOutId") REFERENCES "contract_car_outs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_out_photos" ADD CONSTRAINT "contract_car_out_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_drafts" ADD CONSTRAINT "contract_car_in_drafts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_drafts" ADD CONSTRAINT "contract_car_in_drafts_hirerSignatureAttachmentId_fkey" FOREIGN KEY ("hirerSignatureAttachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_draft_photos" ADD CONSTRAINT "contract_car_in_draft_photos_carInDraftId_fkey" FOREIGN KEY ("carInDraftId") REFERENCES "contract_car_in_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_draft_photos" ADD CONSTRAINT "contract_car_in_draft_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_ins" ADD CONSTRAINT "contract_car_ins_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_ins" ADD CONSTRAINT "contract_car_ins_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_photos" ADD CONSTRAINT "contract_car_in_photos_carInId_fkey" FOREIGN KEY ("carInId") REFERENCES "contract_car_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_car_in_photos" ADD CONSTRAINT "contract_car_in_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliations" ADD CONSTRAINT "contract_reconciliations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliations" ADD CONSTRAINT "contract_reconciliations_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliations" ADD CONSTRAINT "contract_reconciliations_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliations" ADD CONSTRAINT "contract_reconciliations_settledPaymentId_fkey" FOREIGN KEY ("settledPaymentId") REFERENCES "contract_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliation_lines" ADD CONSTRAINT "contract_reconciliation_lines_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "contract_reconciliations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliation_lines" ADD CONSTRAINT "contract_reconciliation_lines_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_reconciliation_lines" ADD CONSTRAINT "contract_reconciliation_lines_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_settledPaymentId_fkey" FOREIGN KEY ("settledPaymentId") REFERENCES "contract_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_renewals" ADD CONSTRAINT "contract_renewals_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_payment_allocations" ADD CONSTRAINT "contract_payment_allocations_contractPaymentId_fkey" FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_contractPaymentId_fkey" FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_maintenanceOrderId_fkey" FOREIGN KEY ("maintenanceOrderId") REFERENCES "maintenance_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_manualExpenseId_fkey" FOREIGN KEY ("manualExpenseId") REFERENCES "manual_expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger_entries" ADD CONSTRAINT "financial_ledger_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_correctionOfExpenseId_fkey" FOREIGN KEY ("correctionOfExpenseId") REFERENCES "manual_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expenses" ADD CONSTRAINT "manual_expenses_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expense_revisions" ADD CONSTRAINT "manual_expense_revisions_manualExpenseId_fkey" FOREIGN KEY ("manualExpenseId") REFERENCES "manual_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_expense_revisions" ADD CONSTRAINT "manual_expense_revisions_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_provider_accounts" ADD CONSTRAINT "gps_provider_accounts_companyScopeId_fkey" FOREIGN KEY ("companyScopeId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_bindings" ADD CONSTRAINT "vehicle_gps_bindings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_bindings" ADD CONSTRAINT "vehicle_gps_bindings_providerAccountId_fkey" FOREIGN KEY ("providerAccountId") REFERENCES "gps_provider_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_binding_histories" ADD CONSTRAINT "vehicle_gps_binding_histories_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_latest_states" ADD CONSTRAINT "vehicle_gps_latest_states_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_gps_latest_states" ADD CONSTRAINT "vehicle_gps_latest_states_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "vehicle_gps_bindings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row_outcomes" ADD CONSTRAINT "import_row_outcomes_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supersedesInvoiceId_fkey" FOREIGN KEY ("supersedesInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_number_sequences" ADD CONSTRAINT "invoice_number_sequences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "vehicle_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_photos" ADD CONSTRAINT "vehicle_photos_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_experiences" ADD CONSTRAINT "purchase_experiences_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "salespeople"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_profiles" ADD CONSTRAINT "customer_payment_profiles_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_methods" ADD CONSTRAINT "customer_payment_methods_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "customer_payment_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_observations" ADD CONSTRAINT "road_liability_observations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_observations" ADD CONSTRAINT "road_liability_observations_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "toll_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_observations" ADD CONSTRAINT "road_liability_observations_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "toll_gates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_attributedContractId_fkey" FOREIGN KEY ("attributedContractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liabilities" ADD CONSTRAINT "road_liabilities_staffEnteredByUserId_fkey" FOREIGN KEY ("staffEnteredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_reconciliationLineId_fkey" FOREIGN KEY ("reconciliationLineId") REFERENCES "contract_reconciliation_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_contractPaymentId_fkey" FOREIGN KEY ("contractPaymentId") REFERENCES "contract_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_manualSelectedByUserId_fkey" FOREIGN KEY ("manualSelectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_liability_customer_charges" ADD CONSTRAINT "road_liability_customer_charges_manualConfirmedByUserId_fkey" FOREIGN KEY ("manualConfirmedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_customerChargeId_fkey" FOREIGN KEY ("customerChargeId") REFERENCES "road_liability_customer_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_roadLiabilityId_fkey" FOREIGN KEY ("roadLiabilityId") REFERENCES "road_liabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_post_close_receivables" ADD CONSTRAINT "contract_post_close_receivables_settledPaymentId_fkey" FOREIGN KEY ("settledPaymentId") REFERENCES "contract_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_contract_integrations" ADD CONSTRAINT "tars_contract_integrations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_operations" ADD CONSTRAINT "tars_operations_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "tars_contract_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_operations" ADD CONSTRAINT "tars_operations_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_vehicle_integrations" ADD CONSTRAINT "tars_vehicle_integrations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_vehicle_integrations" ADD CONSTRAINT "tars_vehicle_integrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_attachment_uploads" ADD CONSTRAINT "tars_attachment_uploads_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_attachment_uploads" ADD CONSTRAINT "tars_attachment_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "operating_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tars_contract_otp_challenges" ADD CONSTRAINT "tars_contract_otp_challenges_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_disconnectedByUserId_fkey" FOREIGN KEY ("disconnectedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_webhook_events" ADD CONSTRAINT "whatsapp_webhook_events_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lastMessageId_fkey" FOREIGN KEY ("lastMessageId") REFERENCES "whatsapp_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_lastReadByUserId_fkey" FOREIGN KEY ("lastReadByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customerLinkedByUserId_fkey" FOREIGN KEY ("customerLinkedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_webhookEventId_fkey" FOREIGN KEY ("webhookEventId") REFERENCES "whatsapp_webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_connection_attempts" ADD CONSTRAINT "whatsapp_connection_attempts_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_outbound_attempts" ADD CONSTRAINT "whatsapp_outbound_attempts_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

