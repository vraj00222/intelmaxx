import type { Metadata } from "next";
import { Special_Elite, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const specialElite = Special_Elite({
  variable: "--font-special-elite",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IntelMaxxing — AI Career Intelligence War Room",
  description:
    "Palantir Gotham, but for your career. You talk, AI agents investigate. Powered by Gemma 4 and ElevenLabs.",
  metadataBase: new URL("https://intelmaxxing.tech"),
  openGraph: {
    title: "IntelMaxxing — AI Career Intelligence War Room",
    description: "You describe the mission. Four AI agents deploy and bring back intel.",
    url: "https://intelmaxxing.tech",
    siteName: "IntelMaxxing",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${specialElite.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono">
        {children}
      </body>
    </html>
  );
}
