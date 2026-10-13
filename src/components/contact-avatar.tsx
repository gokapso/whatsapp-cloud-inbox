import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export function ContactAvatar({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  let hash = 0;
  for (let index = 0; index < label.length; index++)
    hash = ((hash << 5) - hash + label.charCodeAt(index)) | 0;
  const words = label.trim().split(/\s+/);
  const initials =
    words.length > 1 ? words[0][0] + words[1][0] : label.slice(0, 2);
  return (
    <Avatar aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <AvatarFallback
        className={cn(
          "text-[11px] font-medium",
          AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length],
        )}
      >
        {initials.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
