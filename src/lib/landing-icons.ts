import type { LucideIcon } from '@/components/ui/icons';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Brain,
  Check,
  Globe,
  GraduationCap,
  HeartPulse,
  Lock,
  Menu,
  Palette,
  PlayCircle,
  Rocket,
  Shield,
  Sparkles,
  Sprout,
  Star,
  Terminal,
  TrendingUp,
  UserPlus,
  Users,
  Wrench,
  X,
  Zap,
} from '@/components/ui/icons';

/** Nombres semánticos — Material Symbols vía Google Fonts Icons. */
export type LandingIconName =
  | 'arrow-right'
  | 'badge-check'
  | 'bar-chart'
  | 'book-open'
  | 'brain'
  | 'check'
  | 'globe'
  | 'graduation-cap'
  | 'health-pulse'
  | 'lock'
  | 'menu'
  | 'palette'
  | 'play-circle'
  | 'rocket'
  | 'shield'
  | 'sparkles'
  | 'sprout'
  | 'star'
  | 'terminal'
  | 'trending-up'
  | 'user-plus'
  | 'users'
  | 'wrench'
  | 'close'
  | 'zap';

export const LANDING_ICON_MAP: Record<LandingIconName, LucideIcon> = {
  'arrow-right': ArrowRight,
  'badge-check': BadgeCheck,
  'bar-chart': BarChart3,
  'book-open': BookOpen,
  brain: Brain,
  check: Check,
  globe: Globe,
  'graduation-cap': GraduationCap,
  'health-pulse': HeartPulse,
  lock: Lock,
  menu: Menu,
  palette: Palette,
  'play-circle': PlayCircle,
  rocket: Rocket,
  shield: Shield,
  sparkles: Sparkles,
  sprout: Sprout,
  star: Star,
  terminal: Terminal,
  'trending-up': TrendingUp,
  'user-plus': UserPlus,
  users: Users,
  wrench: Wrench,
  close: X,
  zap: Zap,
};

export const LANDING_ICON_STROKE = 1.75;

export const LANDING_ICON_SIZES = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 18,
  xl: 24,
  '2xl': 30,
} as const;

export type LandingIconSize = keyof typeof LANDING_ICON_SIZES;
