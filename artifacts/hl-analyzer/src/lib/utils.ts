import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null) return "$0.00";
  const absValue = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue);
  
  return value < 0 ? `-${formatted}` : formatted;
}

export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0.0%";
  return `${value.toFixed(2)}%`;
}

export function formatCompact(value: number | undefined | null): string {
  if (value === undefined || value === null) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);
}

export function getColorForValue(value: number | undefined | null, invert: boolean = false): string {
  if (value === undefined || value === null || value === 0) return "text-muted-foreground";
  const isPositive = value > 0;
  const good = invert ? !isPositive : isPositive;
  return good ? "text-success text-glow-success" : "text-danger text-glow-danger";
}
