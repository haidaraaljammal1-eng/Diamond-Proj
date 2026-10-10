import { AppError } from "src/lib/errors/app-error";
import { GpsErrorReason } from "src/modules/gps/gps.errors";
import {
  GpsProviderSyncFailureCode,
  type GpsProviderSyncFailureCode as Code,
} from "src/modules/gps/gps-provider-sync.constants";

export function mapErrorToGpsSyncFailureCode(err: unknown): Code {
  if (err instanceof AppError) {
    const reason = err.context?.reason as string | undefined;
    switch (reason) {
      case GpsErrorReason.PROVIDER_AUTH_FAILED:
      case GpsErrorReason.PROVIDER_SESSION_EXPIRED:
        return GpsProviderSyncFailureCode.AUTH_FAILED;
      case GpsErrorReason.PROVIDER_TIMEOUT:
        return GpsProviderSyncFailureCode.TIMEOUT;
      case GpsErrorReason.PROVIDER_CONNECTION_FAILED:
        return GpsProviderSyncFailureCode.NETWORK_ERROR;
      case GpsErrorReason.PROVIDER_REMOTE_ERROR:
        return GpsProviderSyncFailureCode.PROVIDER_HTTP_ERROR;
      case GpsErrorReason.PROVIDER_INVALID_RESPONSE:
        return GpsProviderSyncFailureCode.INVALID_PROVIDER_RESPONSE;
      case GpsErrorReason.PROVIDER_NOT_CONFIGURED:
        return GpsProviderSyncFailureCode.UNEXPECTED;
      default:
        break;
    }
  }
  return GpsProviderSyncFailureCode.UNEXPECTED;
}
