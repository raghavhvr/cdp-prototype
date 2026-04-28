"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Layers, Send, Settings } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/audiences", label: "Audiences", icon: Layers },
  { href: "/users", label: "User Lookup", icon: Users },
  { href: "/activations", label: "Activations", icon: Send },
  { href: "/admin", label: "Admin", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-brand-border bg-brand-surface/60 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-brand-accent flex items-center justify-center text-brand-bg font-bold">
            CDP
          </div>
          <div>
            <div className="font-semibold text-brand-text leading-tight">
              CDP Prototype
            </div>
            <div className="text-xs text-brand-muted leading-tight">
              Anonymous Conversion Funnel
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-brand-elevated text-brand-text"
                    : "text-brand-muted hover:text-brand-text hover:bg-brand-elevated/50"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
