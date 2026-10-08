import { html, type SafeHtml } from "../utils/dom";
import { icon, type IconName } from "./icons";

export type BadgeTone = "brand" | "neutral";
export type BadgeSize = "sm" | "md" | "lg";

export interface BadgeOptions {
  tone?: BadgeTone;
  size?: BadgeSize;
  leadingIcon?: IconName;
}

export function Badge(label: string, { tone = "neutral", size = "sm", leadingIcon }: BadgeOptions = {}): SafeHtml {
  return html`
    <span class="badge badge--${tone} badge--${size}">
      ${leadingIcon && icon(leadingIcon, "badge__icon")}${label}
    </span>
  `;
}

export function AgeBadge(code: string, size: BadgeSize = "sm"): SafeHtml {
  return Badge(code, { tone: "brand", size });
}
