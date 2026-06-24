import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sextant — estimation marché Luxembourg",
  description:
    "Outil interne d'estimation / contexte marché immobilier luxembourgeois (comparables atHome + Immotop, référence Observatoire).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <header className="topbar">
          <div className="inner">
            <div className="brand">
              <div className="logo">⌖</div>
              <div>
                <h1>Sextant</h1>
              </div>
              <span className="tag">estimation &amp; contexte marché · Luxembourg</span>
            </div>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
