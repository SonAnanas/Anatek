import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-base">{label}</Label>
      {children}
      {hint}
    </div>
  );
}
export const inputCls = "h-11 text-base";
export const selectCls = "h-11 w-full rounded-md border border-input bg-card px-3 text-base";
