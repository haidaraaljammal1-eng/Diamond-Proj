import { useTranslations } from "next-intl";
import { Badge } from "@/shared/components/ui/badge";
import { getUserStatusPresentation } from "../../utils/user-status";
import type { UserStatus } from "../../types/user.types";

export interface UserStatusBadgeProps {
  status: UserStatus;
}

export function UserStatusBadge({ status }: UserStatusBadgeProps) {
  const t = useTranslations("Users");
  const presentation = getUserStatusPresentation(status);
  return <Badge variant={presentation.variant}>{t(presentation.translationKey)}</Badge>;
}
