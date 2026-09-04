import type { NavigationConfig } from './navigation.types';

/**
 * Central navigation configuration for Diamond Rent Car
 * Based on Demo visual design - this is the source of truth for navigation structure
 */
export const navigationConfig: NavigationConfig = [
  {
    key: 'dashboard',
    type: 'link',
    labelKey: 'navigation.dashboard',
    href: '/dashboard',
    permission: 'dashboard.read',
  },
  {
    key: 'cars',
    type: 'link',
    labelKey: 'navigation.cars',
    href: '/cars',
    permission: 'cars.read',
  },
  {
    key: 'contracts',
    type: 'link',
    labelKey: 'navigation.contracts',
    href: '/contracts',
    permission: 'contracts.read',
  },
  {
    key: 'operations',
    type: 'link',
    labelKey: 'navigation.operations',
    href: '/operations',
    permission: 'operations.read',
  },
  {
    key: 'finance',
    type: 'link',
    labelKey: 'navigation.finance',
    href: '/finance',
    permission: 'finance.read',
  },
];
