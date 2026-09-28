"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./mark";

const LINKS = [
  { href: "/", label: "Buscas" },
  { href: "/leads", label: "Leads" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Shell({ children, warning }: { children: React.ReactNode; warning?: string }) {
  const path = usePathname();

  return (
    <div className="shell">
      <aside className="rail">
        <Link href="/" className="brand">
          <Mark className="mark" />
          <span>Radar GS</span>
        </Link>
        <nav>
          {LINKS.map((link) => {
            const on = link.href === "/" ? path === "/" : path.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={on ? "nav-on" : "nav-off"} aria-current={on ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="stage">
        {warning && <p className="banner">{warning}</p>}
        <main>{children}</main>
      </div>
    </div>
  );
}
