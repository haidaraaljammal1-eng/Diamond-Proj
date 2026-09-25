/** English messages. Keys are natural-language sentences (identity map). */
export const en: Record<string, string> = {
  "Invalid email or password": "Invalid email or password",
  "Authentication required": "Authentication required",
  "Access token expired": "Access token has expired",
  "Invalid or expired token": "Invalid or expired token",
  Forbidden: "Forbidden",
  "You do not have permission to perform this action":
    "You do not have permission to perform this action",
  "Not found": "Not found",
  "Resource not found": "Resource not found",
  "Validation failed": "Validation failed",
  "Account is suspended": "This account is suspended",
  "Account setup is required": "Account setup is required before signing in",
  "Email already in use": "This email address is already in use",
  "Password does not meet the minimum requirements":
    "Password does not meet the minimum requirements",
  "Too many requests, please try again later":
    "Too many requests, please try again later",
  "Internal server error": "An unexpected error occurred",
  "User not found": "User not found",
  "Role not found": "Role not found",
  "Permission not found": "Permission not found",
  "System roles cannot be deleted": "System roles cannot be deleted",
  "System roles cannot be modified": "System roles cannot be modified",
  "Current password is incorrect": "Current password is incorrect",
  // Two-factor authentication
  "The verification code is incorrect or has expired":
    "The verification code is incorrect or has expired",
  "The verification session is no longer valid, please sign in again":
    "The verification session is no longer valid, please sign in again",
  "The verification session has expired, please sign in again":
    "The verification session has expired, please sign in again",
  "Too many incorrect attempts, please sign in again":
    "Too many incorrect attempts, please sign in again",
  "Two-factor authentication is already enabled":
    "Two-factor authentication is already enabled",
  "Two-factor authentication is not enabled":
    "Two-factor authentication is not enabled",
  "Start two-factor setup again — no pending setup was found or it has expired":
    "Start two-factor setup again — no pending setup was found or it has expired",
  "The current password is incorrect": "The current password is incorrect",
  "Enter a code from your authenticator app or a recovery code":
    "Enter a code from your authenticator app or a recovery code",
  "Setup cancelled": "Setup cancelled",
  "Two-factor authentication disabled": "Two-factor authentication disabled",
  "Setting not found": "Setting not found",
  "File type is not allowed": "This file type is not allowed",
  "File is too large": "The file is too large",
  "Uploaded file failed content validation":
    "The uploaded file failed content validation",
  "Attachment not found": "Attachment not found",
  "Notification not found": "Notification not found",
  "Refresh token is invalid or has been revoked":
    "Refresh token is invalid or has been revoked",
  "Cannot remove the last administrator":
    "Cannot remove the last account with administrative access",
  "Resource has been modified by another request":
    "This resource was modified by another request; please reload and retry",
  "A conflicting resource already exists": "A conflicting resource already exists",
  "If the account exists, a reset link has been sent":
    "If an account exists for that email, a password reset link has been sent",
  "Password updated": "Your password has been updated",
  "Account activated": "Your account has been activated",
  "Logged out": "You have been logged out",
  "Notification marked as read": "Notification marked as read",
  "All notifications marked as read": "All notifications marked as read",
  "Preferences updated": "Preferences updated",
  Deleted: "Deleted successfully",

  // Master data
  "Region not found": "Region not found",
  "City not found": "City not found",
  "Branch not found": "Branch not found",
  "Vehicle model not found": "Vehicle model not found",
  "Department not found": "Department not found",
  "Salesperson not found": "Salesperson not found",
  "A record with this code already exists": "A record with this code already exists",
  "Referenced record does not exist": "The referenced record does not exist",
  "This field cannot be changed after creation":
    "This field cannot be changed after creation",
  "A salesperson with this external ID already exists":
    "A salesperson with this external ID already exists",
  "This user is already linked to a salesperson":
    "This user is already linked to a salesperson",

  // Operational domain (customers / vehicles / experiences)
  "Customer not found": "Customer not found",
  "Vehicle not found": "Vehicle not found",
  "Purchase experience not found": "Purchase experience not found",
  "Referenced record is inactive": "The referenced record is inactive",
  "A vehicle with this VIN already exists": "A vehicle with this VIN already exists",
  "This external identifier is already in use": "This external identifier is already in use",
  "A record with this external sale identifier already exists":
    "A record with this external sale identifier already exists",

  // Imports
  "Import job not found": "Import job not found",
  "A file is required": "A file is required",
  "Import file type is not supported": "This import file type is not supported",
  "XLSX import is not supported yet; upload a CSV file":
    "XLSX import is not supported yet; upload a CSV file",
  "Only CSV files are supported": "Only CSV files are supported",
  "File content-type is not an accepted CSV type":
    "The file content-type is not an accepted CSV type",
  "File does not look like text/CSV": "The file does not look like a text/CSV file",
  "Import file could not be parsed as CSV": "The import file could not be parsed as CSV",
  "Import file could not be parsed": "The import file could not be parsed",
  "Import file is too large": "The import file is too large",
  "Import mapping is invalid": "The import mapping is invalid",
  "Mapping references a column not present in the file":
    "The mapping references a column that is not present in the file",
  "Mapping references an unknown target field":
    "The mapping references an unknown target field",
  "A target field is mapped more than once": "A target field is mapped more than once",
  "Import mapping has not been saved yet": "The import mapping has not been saved yet",
  "Import mapping is missing required columns":
    "The import mapping is missing required columns",
  "Import job is not ready for this action": "The import job is not ready for this action",
  "Import job has already been processed": "The import job has already been processed",

  "No published version to base a new draft on": "There is no published version to base a new draft on",
  "The draft was modified by another request; reload and retry":
    "The draft was modified by another request; reload and retry",

  // Communication templates
  "Communication template not found": "Communication template not found",
  "Template version not found": "Template version not found",
  "A communication template with this code already exists": "A communication template with this code already exists",
  "A published template version cannot be modified": "A published template version cannot be modified",
  "This template already has an open draft version": "This template already has an open draft version",
  "The template content is invalid": "The template content is invalid",
  "Template version has no content to preview": "This template version has no content to preview",
  "Delivery content not found": "Delivery content not found",
  "QR distribution not found": "QR distribution not found",

  // Call center
  "Call queue item not found": "Call queue item not found",
  "This call is already claimed by another agent": "This call is already claimed by another agent",
  "This call item cannot be claimed in its current state": "This call item cannot be claimed in its current state",
  "This call item is assigned to another agent": "This call item is assigned to another agent",
  "Call session not found": "Call session not found",
  "A call is already in progress for this item": "A call is already in progress for this item",
  "This call is already completed": "This call is already completed",
  "Invalid call outcome": "Invalid call outcome",
  "A callback time is required for this outcome": "A callback time is required for this outcome",
  "The callback time must be in the future": "The callback time must be in the future",
  "Callback not found": "Callback not found",
  "This item has reached the maximum number of attempts": "This item has reached the maximum number of attempts",
  "This customer is marked unreachable": "This customer is marked unreachable",
  "This customer has opted out of phone contact": "This customer has opted out of phone contact and cannot be called",
  "No recording is available for this call": "No recording is available for this call",
  "You are not allowed to access call recordings": "You are not allowed to access call recordings",
  "An active call item already exists for this reason": "An active call item already exists for this reason",
  "Invalid queue source": "Invalid queue source",
  "The export exceeds the maximum size; narrow the filters": "The export exceeds the maximum size; narrow the filters",
  "This branch is outside your assigned scope": "This branch is outside your assigned scope",

  // Complaints
  "Complaint not found": "Complaint not found",
  "Complaint category not found": "Complaint category not found",
  "This complaint is already closed": "This complaint is already closed",
  "This complaint is not open": "This complaint is not open",
  "This complaint is not resolved": "This complaint is not resolved",
  "This complaint stage transition is not allowed": "This complaint stage transition is not allowed",
  "The complaint was modified by another request; reload and retry": "The complaint was modified by another request; reload and retry",
  "The selected assignee is not eligible for this complaint": "The selected assignee is not eligible for this complaint",
  "A department is required for this complaint": "A department is required for this complaint",
  "A resolution summary is required to close this complaint": "A resolution summary is required to close this complaint",
  "This complaint is already at this escalation level": "This complaint is already at this escalation level",
  "Only resolved or closed complaints can be reopened": "Only resolved or closed complaints can be reopened",
  "The requested branch conflicts with the purchase experience branch": "The requested branch conflicts with the purchase experience branch",
  "This complaint is outside your assigned scope": "This complaint is outside your assigned scope",
  "Routing rule not found": "Routing rule not found",
  "The routing rule condition is invalid": "The routing rule condition is invalid",
  "The routing rule was modified by another request; reload and retry": "The routing rule was modified by another request; reload and retry",
  "SLA policy not found": "SLA policy not found",
  "The SLA policy was modified by another request; reload and retry": "The SLA policy was modified by another request; reload and retry",
  "This attachment type is not allowed": "This attachment type is not allowed",
  "The attachment is too large": "The attachment is too large",
  "The attachment failed content validation": "The attachment failed content validation",
  "The attachment is not available": "The attachment is not available",

  // Reports / integrations / security
  "Report not found": "Report not found",
  "The reporting period is invalid": "The reporting period is invalid",
  "The report export exceeds the maximum size; narrow the filters": "The report export exceeds the maximum size; narrow the filters",
  "This report format is not supported": "This report format is not supported",
  "Report schedule not found": "Report schedule not found",
  "The report schedule is invalid": "The report schedule is invalid",
  "The report artifact is not available": "The report artifact is not available",
  "KPI target not found": "KPI target not found",
  "An overlapping active KPI target already exists for this scope/period": "An overlapping active KPI target already exists for this scope/period",
  "API key not found": "API key not found",
  "Invalid or unauthorized API key": "Invalid or unauthorized API key",
  "The API key lacks the required scope": "The API key lacks the required scope",
  "The API key lacks access to this branch": "The API key lacks access to this branch",
  "Integration not found": "Integration not found",
  "This integration is not configured": "This integration is not configured",
  "The audit export exceeds the maximum size; narrow the filters": "The audit export exceeds the maximum size; narrow the filters",

  // Import mapping field labels (column-matching options)
  "Customer name": "Customer name",
  Mobile: "Mobile",
  Email: "Email",
  "External customer ID": "External customer ID",
  "Customer type": "Customer type",
  "Opt out: email": "Opt out: email",
  "Opt out: SMS": "Opt out: SMS",
  "Opt out: phone": "Opt out: phone",
  "Opt out: WhatsApp": "Opt out: WhatsApp",
  VIN: "VIN",
  "Vehicle model": "Vehicle model",
  "Vehicle model code": "Vehicle model code",
  "Model year": "Model year",
  "Vehicle color": "Vehicle color",
  "External vehicle ID": "External vehicle ID",
  Branch: "Branch",
  "Branch code": "Branch code",
  Salesperson: "Salesperson",
  "Salesperson code": "Salesperson code",
  "Salesperson external ID": "Salesperson external ID",
  "Purchase date": "Purchase date",
  "Delivery date": "Delivery date",
  "External sale ID": "External sale ID",
  "Financing type": "Financing type",
  "Insurance type": "Insurance type",
  "Sales channel": "Sales channel",

  "Contract not found": "Contract not found",
  "Contract status transition is not allowed": "Contract status transition is not allowed",
  "Vehicle is not available for rental": "Vehicle is not available for rental",
  "Vehicle is already reserved or rented": "Vehicle is already reserved or rented",
  "Contract link is invalid": "Contract link is invalid",
  "Contract link has expired": "Contract link has expired",
  "Contract link has already been used": "Contract link has already been used",
  "A confirmed payment is required": "A confirmed payment is required",
  "Car-Out is required before this action": "Car-Out is required before this action",
  "Car-In is required before this action": "Car-In is required before this action",
  "Reconciliation must be approved before closing": "Reconciliation must be approved before closing",
  "Contract is already closed": "Contract is already closed",
  "Idempotency key was reused with a different request":
    "Idempotency key was reused with a different request",
  "Car inspection requires all 8 unique angles": "Car inspection requires all 8 unique angles",
  "Identity number or passport number is required": "Identity number or passport number is required",
  "Customer form must be completed first": "Customer form must be completed first",
  "Contract photo not found": "Contract photo not found",
  "A valid driving license is required": "A valid driving license is required",
  "Driving license verification is not configured":
    "Driving license verification is not configured",
  "Driving license could not be read": "Driving license could not be read",
  "Driving license requires another photo": "Driving license requires another photo",
  "Driving license is expired": "Driving license is expired",
  "Public rental form is incomplete": "Public rental form is incomplete",
  "Rental is not ready for acceptance": "Rental is not ready for acceptance",
  "Card payment is not configured": "Card payment is not configured",
  "Payment checkout could not be prepared": "Payment checkout could not be prepared",
  "Unable to prepare the payment right now. Please try again.":
    "Unable to prepare the payment right now. Please try again.",
  "A previous payment attempt could not be recovered": "A previous payment attempt could not be recovered",
  "Card payment is temporarily unavailable": "Card payment is temporarily unavailable",
  "Payment configuration is invalid": "Payment configuration is invalid",
  "Electronic payment is not allowed": "Electronic payment is not allowed",
  "A payment attempt is already in progress": "A payment attempt is already in progress",
  "Cash collection is blocked while an electronic checkout can still be paid":
    "Cash collection is blocked while an electronic checkout can still be paid",
  "Payment attempt was not found": "Payment attempt was not found",
  "Payment status token is invalid": "Payment status token is invalid",
  "Payment status token has expired": "Payment status token has expired",

  "WhatsApp provider is not configured": "WhatsApp provider is not configured",
  "WhatsApp connection attempt has expired": "WhatsApp connection attempt has expired",
  "WhatsApp connection attempt has already been used":
    "WhatsApp connection attempt has already been used",
  "WhatsApp provider authorization failed": "WhatsApp provider authorization failed",
  "Selected WhatsApp Business Account was not granted by Meta":
    "Selected WhatsApp Business Account was not granted by Meta",
  "Selected WhatsApp phone number was not granted by Meta":
    "Selected WhatsApp phone number was not granted by Meta",
  "WhatsApp connection could not be validated": "WhatsApp connection could not be validated",
  "WhatsApp connection was not found": "WhatsApp connection was not found",
  "WhatsApp connection was changed by another request":
    "WhatsApp connection was changed by another request",
  "WhatsApp connection attempt was not found": "WhatsApp connection attempt was not found",
  "WhatsApp conversation was not found": "WhatsApp conversation was not found",
  "WhatsApp conversation is not on the active office connection":
    "WhatsApp conversation is not on the active office connection",
  "WhatsApp inbound webhook is not active": "WhatsApp inbound webhook is not active",
  "The 24-hour WhatsApp customer service window has ended":
    "The 24-hour WhatsApp customer service window has ended",
  "WhatsApp customer service window cannot be verified":
    "WhatsApp customer service window cannot be verified",
  "WhatsApp provider rejected the message": "WhatsApp provider rejected the message",
  "WhatsApp send outcome is uncertain": "WhatsApp send outcome is uncertain",
  "WhatsApp send was rate limited": "WhatsApp send was rate limited",
  "WhatsApp send authorization failed": "WhatsApp send authorization failed",
  "WhatsApp message text is invalid": "WhatsApp message text is invalid",
};
