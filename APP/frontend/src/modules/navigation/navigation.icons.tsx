import type { ComponentType, SVGProps } from "react";
import type { NavigationIconKey } from "./navigation.types";

/**
 * Navigation icons — extracted verbatim from the Diamond Demo rail (`#rail`).
 * Same viewBoxes, same stroke style (1.7), fill none. `currentColor` drives
 * active/inactive coloring exactly like the Demo CSS cascade.
 */
type IconProps = SVGProps<SVGSVGElement>;

function DashboardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

function CarsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M4 15l1.7-5.2A2.4 2.4 0 0 1 8 8h8a2.4 2.4 0 0 1 2.3 1.8L20 15" />
      <path d="M3.5 15h17v3.4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V17h-9v1.4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function GpsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 1.2v3.4M12 19.4v3.4M1.2 12h3.4M19.4 12h3.4" />
    </svg>
  );
}

function MaintenanceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ArchiveIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M4 4h16v4H4zM6 10h12v10H6z" />
      <path d="M9 13h6M9 16h4" />
    </svg>
  );
}

function ViolationsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M12 3 21 19H3L12 3z" />
      <path d="M12 9v4M12 16h.01" />
    </svg>
  );
}

function FinanceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M4 19V5M4 19h16" />
      <path d="m7 15 3-4 3 2 5-7" />
      <path d="M17 6h2v2" />
    </svg>
  );
}

function InvoicesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function ContractsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M7 3h8l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9.5 12h6M9.5 16h6" />
    </svg>
  );
}

function ChatsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

function TeamIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 19c.7-3 3-4.6 5.5-4.6s4.8 1.6 5.5 4.6" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M16.5 14.6c2 .3 3.6 1.7 4 4.4" />
    </svg>
  );
}

/* Access control — a shield over a key line, in the Demo rail stroke style. */
function RolesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <path d="M12 3.2 19 6v5.6c0 4-2.9 7.4-7 9.2-4.1-1.8-7-5.2-7-9.2V6z" />
      <circle cx="12" cy="10.6" r="1.9" />
      <path d="M12 12.5v3.6M12 14.6h1.7" />
    </svg>
  );
}

export const NAVIGATION_ICONS: Record<
  NavigationIconKey,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  dashboard: DashboardIcon,
  cars: CarsIcon,
  gps: GpsIcon,
  maintenance: MaintenanceIcon,
  archive: ArchiveIcon,
  violations: ViolationsIcon,
  finance: FinanceIcon,
  invoices: InvoicesIcon,
  contracts: ContractsIcon,
  chats: ChatsIcon,
  team: TeamIcon,
  roles: RolesIcon,
};