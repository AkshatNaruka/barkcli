import React from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  BarChart3,
  Bell,
  Bot,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Code2,
  Columns3,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  Flag,
  Folder,
  FolderPlus,
  GitBranch,
  GitPullRequest,
  Globe,
  GripVertical,
  History,
  Inbox,
  Key,
  Layers,
  LayoutGrid,
  Link2,
  List,
  ListFilter,
  ListTree,
  MessageSquare,
  Monitor,
  Moon,
  MoreHorizontal,
  Palette,
  PanelLeft,
  Pencil,
  Pin,
  Play,
  Plus,
  RefreshCcw,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Settings,
  Sparkles,
  Square,
  Star,
  Sun,
  Terminal,
  Trash2,
  TriangleAlert,
  Users,
  WrapText,
  X,
  type LucideIcon,
} from "lucide-react";

export type IconName =
  | "search" | "pin" | "pencil" | "copy" | "history" | "pulse" | "trash"
  | "comment" | "blocked" | "clock" | "calendar" | "warn" | "subtasks"
  | "check" | "refresh" | "bell" | "gear" | "robot" | "doc" | "chart"
  | "board" | "panel" | "spark" | "layers" | "cycle" | "code" | "db" | "star"
  | "chevL" | "chevR" | "chevDown" | "chevUp" | "flag" | "link" | "moon" | "sun" | "monitor"
  | "x" | "users" | "inbox" | "arrowUp" | "arrowFlat" | "arrowDown" | "arrowLeft"
  | "download" | "palette" | "eye" | "eyeOff" | "plus" | "stop" | "dots" | "grid" | "folder" | "filter" | "branch" | "pr" | "terminal" | "list" | "sliders" | "grip"
  | "play" | "wrap" | "globe" | "filePlus" | "checkSquare" | "folderPlus" | "key";

const GLYPHS: Record<IconName, LucideIcon> = {
  search: Search,
  pin: Pin,
  pencil: Pencil,
  copy: Copy,
  history: History,
  pulse: Activity,
  trash: Trash2,
  comment: MessageSquare,
  blocked: Ban,
  clock: Clock3,
  calendar: Calendar,
  warn: TriangleAlert,
  subtasks: ListTree,
  check: Check,
  refresh: RefreshCw,
  bell: Bell,
  gear: Settings,
  robot: Bot,
  doc: FileText,
  chart: BarChart3,
  board: Columns3,
  panel: PanelLeft,
  spark: Sparkles,
  layers: Layers,
  cycle: RefreshCcw,
  code: Code2,
  db: Database,
  star: Star,
  chevL: ChevronLeft,
  chevR: ChevronRight,
  chevDown: ChevronDown,
  chevUp: ChevronUp,
  flag: Flag,
  link: Link2,
  moon: Moon,
  sun: Sun,
  monitor: Monitor,
  x: X,
  users: Users,
  inbox: Inbox,
  arrowUp: ArrowUp,
  arrowLeft: ArrowLeft,
  arrowFlat: ArrowRight,
  arrowDown: ArrowDown,
  download: Download,
  palette: Palette,
  eye: Eye,
  eyeOff: EyeOff,
  plus: Plus,
  stop: Square,
  dots: MoreHorizontal,
  grid: LayoutGrid,
  folder: Folder,
  filter: ListFilter,
  branch: GitBranch,
  pr: GitPullRequest,
  terminal: Terminal,
  list: List,
  sliders: SlidersHorizontal,
  key: Key,
  grip: GripVertical,
  play: Play,
  wrap: WrapText,
  globe: Globe,
  filePlus: FilePlus,
  checkSquare: CheckSquare,
  folderPlus: FolderPlus,
};

/**
 * One icon system across the app. Lucide provides the drawn marks; this
 * component keeps the semantic names used by the product and a consistent
 * stroke weight, size, and optical alignment.
 */
export function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const Glyph = GLYPHS[name];
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  );
}
