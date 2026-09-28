import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { Shell } from "./shell";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = { title: "Radar GS" };

const MISSING_ENV = ["GOOGLE_PLACES_API_KEY", "GOOGLE_SHEETS_SA_JSON", "RADAR_SHEET_ID"].filter(
  (name) => !process.env[name],
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={sora.variable}>
      <body>
        <Shell
          warning={
            MISSING_ENV.length > 0
              ? `Faltam as variáveis ${MISSING_ENV.join(", ")}. Rode direnv allow na pasta do projeto e reinicie o npm run dev.`
              : undefined
          }
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
