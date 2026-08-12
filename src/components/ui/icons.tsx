'use client';

import type { CSSProperties, ReactElement } from 'react';
import { MaterialIcon } from '@/components/ui/material-icon';

export type LucideProps = {
  size?: number | string;
  className?: string;
  strokeWidth?: number | string;
  color?: string;
  style?: CSSProperties;
  fill?: string;
  absoluteStrokeWidth?: boolean;
  'aria-hidden'?: boolean | 'true' | 'false';
};

/** Compat con componentes que tipaban LucideIcon. */
export type LucideIcon = (props: LucideProps) => ReactElement;

function makeIcon(symbol: string, displayName: string): LucideIcon {
  function IconComp({
    size = 20,
    className,
    style,
    color,
    fill,
    'aria-hidden': ariaHidden = true,
  }: LucideProps) {
    const filled = Boolean(fill && fill !== 'none' && fill !== 'transparent');
    const spin = displayName === 'Loader2' || (className || '').includes('animate-spin');
    return (
      <MaterialIcon
        name={symbol}
        size={size}
        className={[className, spin ? 'material-symbol-spin' : ''].filter(Boolean).join(' ')}
        filled={filled}
        aria-hidden={ariaHidden}
        style={{ color, ...style }}
      />
    );
  }
  IconComp.displayName = displayName;
  return IconComp;
}

export const Activity = makeIcon('monitoring', 'Activity');
export const AlertCircle = makeIcon('error', 'AlertCircle');
export const AlertTriangle = makeIcon('warning', 'AlertTriangle');
export const AlignLeft = makeIcon('format_align_left', 'AlignLeft');
export const ArrowDown = makeIcon('arrow_downward', 'ArrowDown');
export const ArrowLeft = makeIcon('arrow_back', 'ArrowLeft');
export const ArrowLeftRight = makeIcon('compare_arrows', 'ArrowLeftRight');
export const ArrowRight = makeIcon('arrow_forward', 'ArrowRight');
export const ArrowUp = makeIcon('arrow_upward', 'ArrowUp');
export const ArrowUpRight = makeIcon('north_east', 'ArrowUpRight');
export const Award = makeIcon('military_tech', 'Award');
export const BadgeCheck = makeIcon('verified', 'BadgeCheck');
export const Ban = makeIcon('block', 'Ban');
export const BarChart2 = makeIcon('bar_chart', 'BarChart2');
export const BarChart3 = makeIcon('bar_chart', 'BarChart3');
export const Bell = makeIcon('notifications', 'Bell');
export const BookOpen = makeIcon('menu_book', 'BookOpen');
export const Bot = makeIcon('smart_toy', 'Bot');
export const Box = makeIcon('package_2', 'Box');
export const Boxes = makeIcon('widgets', 'Boxes');
export const Braces = makeIcon('data_object', 'Braces');
export const Brain = makeIcon('psychology', 'Brain');
export const Bug = makeIcon('bug_report', 'Bug');
export const Building2 = makeIcon('apartment', 'Building2');
export const Calendar = makeIcon('calendar_month', 'Calendar');
export const CalendarDays = makeIcon('calendar_month', 'CalendarDays');
export const Check = makeIcon('check', 'Check');
export const CheckCheck = makeIcon('done_all', 'CheckCheck');
export const CheckCircle = makeIcon('check_circle', 'CheckCircle');
export const CheckCircle2 = makeIcon('check_circle', 'CheckCircle2');
export const ChevronDown = makeIcon('expand_more', 'ChevronDown');
export const ChevronLeft = makeIcon('chevron_left', 'ChevronLeft');
export const ChevronRight = makeIcon('chevron_right', 'ChevronRight');
export const ChevronUp = makeIcon('expand_less', 'ChevronUp');
export const Circle = makeIcon('circle', 'Circle');
export const CircleHelp = makeIcon('help', 'CircleHelp');
export const CircleOff = makeIcon('do_not_disturb_on', 'CircleOff');
export const ClipboardList = makeIcon('assignment', 'ClipboardList');
export const Clock = makeIcon('schedule', 'Clock');
export const CloudRain = makeIcon('rainy', 'CloudRain');
export const Code2 = makeIcon('code', 'Code2');
export const Copy = makeIcon('content_copy', 'Copy');
export const CornerDownRight = makeIcon('subdirectory_arrow_right', 'CornerDownRight');
export const Cpu = makeIcon('memory', 'Cpu');
export const CreditCard = makeIcon('credit_card', 'CreditCard');
export const Crown = makeIcon('workspace_premium', 'Crown');
export const Database = makeIcon('database', 'Database');
export const Dices = makeIcon('casino', 'Dices');
export const DollarSign = makeIcon('attach_money', 'DollarSign');
export const Download = makeIcon('download', 'Download');
export const Droplets = makeIcon('water_drop', 'Droplets');
export const ExternalLink = makeIcon('open_in_new', 'ExternalLink');
export const Eye = makeIcon('visibility', 'Eye');
export const EyeOff = makeIcon('visibility_off', 'EyeOff');
export const File = makeIcon('draft', 'File');
export const FileDown = makeIcon('download', 'FileDown');
export const FileText = makeIcon('description', 'FileText');
export const Filter = makeIcon('filter_list', 'Filter');
export const Fingerprint = makeIcon('fingerprint', 'Fingerprint');
export const Flag = makeIcon('flag', 'Flag');
export const Gauge = makeIcon('speed', 'Gauge');
export const GitBranch = makeIcon('account_tree', 'GitBranch');
export const Globe = makeIcon('public', 'Globe');
export const Globe2 = makeIcon('language', 'Globe2');
export const GraduationCap = makeIcon('school', 'GraduationCap');
export const GripVertical = makeIcon('drag_indicator', 'GripVertical');
export const HardDrive = makeIcon('hard_drive', 'HardDrive');
export const Hash = makeIcon('tag', 'Hash');
export const Headphones = makeIcon('headphones', 'Headphones');
export const HeartPulse = makeIcon('cardiology', 'HeartPulse');
export const HelpCircle = makeIcon('help', 'HelpCircle');
export const Image = makeIcon('image', 'Image');
export const ImageIcon = makeIcon('image', 'ImageIcon');
export const Inbox = makeIcon('inbox', 'Inbox');
export const Info = makeIcon('info', 'Info');
export const KeyRound = makeIcon('key', 'KeyRound');
export const Landmark = makeIcon('account_balance', 'Landmark');
export const Layers = makeIcon('layers', 'Layers');
export const LayoutDashboard = makeIcon('dashboard', 'LayoutDashboard');
export const Leaf = makeIcon('eco', 'Leaf');
export const Lightbulb = makeIcon('lightbulb', 'Lightbulb');
export const LineChart = makeIcon('show_chart', 'LineChart');
export const Link2 = makeIcon('link', 'Link2');
export const ListChecks = makeIcon('checklist', 'ListChecks');
export const Loader2 = makeIcon('progress_activity', 'Loader2');
export const Lock = makeIcon('lock', 'Lock');
export const LogOut = makeIcon('logout', 'LogOut');
export const Mail = makeIcon('mail', 'Mail');
export const MapPin = makeIcon('location_on', 'MapPin');
export const Menu = makeIcon('menu', 'Menu');
export const MessageCircle = makeIcon('chat_bubble', 'MessageCircle');
export const MessageSquare = makeIcon('chat', 'MessageSquare');
export const MessageSquareText = makeIcon('chat', 'MessageSquareText');
export const Mic = makeIcon('mic', 'Mic');
export const Microscope = makeIcon('biotech', 'Microscope');
export const Minus = makeIcon('remove', 'Minus');
export const Moon = makeIcon('dark_mode', 'Moon');
export const MoreVertical = makeIcon('more_vert', 'MoreVertical');
export const Network = makeIcon('lan', 'Network');
export const Paintbrush = makeIcon('brush', 'Paintbrush');
export const Palette = makeIcon('palette', 'Palette');
export const Paperclip = makeIcon('attach_file', 'Paperclip');
export const Pause = makeIcon('pause', 'Pause');
export const Pencil = makeIcon('edit', 'Pencil');
export const Phone = makeIcon('call', 'Phone');
export const PieChart = makeIcon('pie_chart', 'PieChart');
export const Pin = makeIcon('keep', 'Pin');
export const Play = makeIcon('play_arrow', 'Play');
export const PlayCircle = makeIcon('play_circle', 'PlayCircle');
export const Plug = makeIcon('power', 'Plug');
export const Plus = makeIcon('add', 'Plus');
export const Power = makeIcon('power_settings_new', 'Power');
export const PowerOff = makeIcon('power_off', 'PowerOff');
export const Receipt = makeIcon('receipt_long', 'Receipt');
export const RefreshCw = makeIcon('refresh', 'RefreshCw');
export const Rocket = makeIcon('rocket_launch', 'Rocket');
export const RotateCcw = makeIcon('undo', 'RotateCcw');
export const Route = makeIcon('route', 'Route');
export const Save = makeIcon('save', 'Save');
export const Scale = makeIcon('scale', 'Scale');
export const Scissors = makeIcon('content_cut', 'Scissors');
export const ScrollText = makeIcon('article', 'ScrollText');
export const Search = makeIcon('search', 'Search');
export const Send = makeIcon('send', 'Send');
export const Settings = makeIcon('settings', 'Settings');
export const Settings2 = makeIcon('tune', 'Settings2');
export const Share = makeIcon('share', 'Share');
export const Share2 = makeIcon('share', 'Share2');
export const Shield = makeIcon('shield', 'Shield');
export const ShieldAlert = makeIcon('gpp_maybe', 'ShieldAlert');
export const ShieldCheck = makeIcon('verified_user', 'ShieldCheck');
export const ShieldOff = makeIcon('gpp_bad', 'ShieldOff');
export const Ship = makeIcon('directions_boat', 'Ship');
export const ShoppingBag = makeIcon('shopping_bag', 'ShoppingBag');
export const Sliders = makeIcon('tune', 'Sliders');
export const SlidersHorizontal = makeIcon('tune', 'SlidersHorizontal');
export const Smartphone = makeIcon('smartphone', 'Smartphone');
export const Sparkles = makeIcon('auto_awesome', 'Sparkles');
export const Sprout = makeIcon('potted_plant', 'Sprout');
export const Star = makeIcon('star', 'Star');
export const Stethoscope = makeIcon('stethoscope', 'Stethoscope');
export const Sun = makeIcon('light_mode', 'Sun');
export const Target = makeIcon('target', 'Target');
export const Terminal = makeIcon('terminal', 'Terminal');
export const Ticket = makeIcon('confirmation_number', 'Ticket');
export const Timer = makeIcon('timer', 'Timer');
export const Trash2 = makeIcon('delete', 'Trash2');
export const TrendingDown = makeIcon('trending_down', 'TrendingDown');
export const TrendingUp = makeIcon('trending_up', 'TrendingUp');
export const Type = makeIcon('text_fields', 'Type');
export const Upload = makeIcon('upload', 'Upload');
export const User = makeIcon('person', 'User');
export const UserCheck = makeIcon('person_check', 'UserCheck');
export const UserPlus = makeIcon('person_add', 'UserPlus');
export const UserRound = makeIcon('account_circle', 'UserRound');
export const Users = makeIcon('group', 'Users');
export const Volume2 = makeIcon('volume_up', 'Volume2');
export const Wallet = makeIcon('account_balance_wallet', 'Wallet');
export const Webhook = makeIcon('webhook', 'Webhook');
export const Wrench = makeIcon('build', 'Wrench');
export const X = makeIcon('close', 'X');
export const XCircle = makeIcon('cancel', 'XCircle');
export const Zap = makeIcon('bolt', 'Zap');

/** Helper para iconos ad-hoc por nombre de Google Fonts Icons. */
export function googleIcon(symbol: string, displayName = symbol): LucideIcon {
  return makeIcon(symbol, displayName);
}
