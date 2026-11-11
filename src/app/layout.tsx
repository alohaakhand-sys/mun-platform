import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Big_Shoulders, Newsreader } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

const themeInitScript = `(function(){try{var t=localStorage.getItem('mun-theme');if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
});

// Numeral / console typeface — timers, tallies, scores in the live-session panels.
const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// Signage typeface — the PROJECTOR BOARD only (placards, outcome words, phase titles). A
// wayfinding face built to be read at distance, which is the board's whole problem. `latin-ext`
// is not optional: delegation names include Côte d'Ivoire, Türkiye, São Tomé and Príncipe.
const bigShoulders = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800", "900"],
  display: "swap",
  // next/font ships no metrics for this family (Google folded `Big Shoulders Display` into
  // `Big Shoulders`), so it cannot synthesize a size-adjusted fallback and warns at build. Name a
  // CONDENSED stack by hand instead: a placard that falls back to a normal-width face blows its
  // own width out and pushes the country name off the card.
  adjustFontFallback: false,
  fallback: ["Arial Narrow", "Helvetica Neue Condensed", "system-ui", "sans-serif"],
});

// Display serif for the `.mun-paper` / `.mun-chrome` scope (public pages AND the dashboard):
// Newsreader for headings, Inter (`--font-sans`, above) runs the interface. Variable font, so
// no `weight` array — the whole axis ships in one file.
const newsreader = Newsreader({
  variable: "--font-mp-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MUN Pilot",
  description: "The ultimate Model UN management platform",
};

import { AppWrapper } from "@/components/layout/AppWrapper";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} ${jetBrainsMono.variable} ${bigShoulders.variable} ${newsreader.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans selection:bg-primary/30">
        <ThemeProvider>
          <AuthProvider>
            <AppWrapper>
              {children}
            </AppWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
