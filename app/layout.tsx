import type { Metadata } from "next";
import "@/index.css";

export const metadata: Metadata = {
  title: "CareLink - Emergency Response & Hospital Capacity System",
  description:
    "Real-time emergency response, smart hospital recommendations, and resource management.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
