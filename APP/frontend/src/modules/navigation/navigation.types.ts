export type NavigationItemType = 'link' | 'section';

export interface NavigationItem {
  key: string;
  type: 'link' | 'section';
  labelKey: string;
  href?: string;
  icon?: React.ReactNode;
  permission?: string;
  badge?: number;
}

export interface NavigationSection {
  key: string;
  type: 'section';
  labelKey: string;
  items: NavigationItem[];
}

export type NavigationConfig = (NavigationItem | NavigationSection)[];

export interface UseNavigationResult {
  items: NavigationConfig;
  isActive: (href: string) => boolean;
  currentLocale: string;
}
