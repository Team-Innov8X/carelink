import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../index.css";
import NavigationTransition from "./navigation-transition";

export const metadata: Metadata = {
  title: "CareLink | Emergency Response Network",
  description: "Coordinate emergency response, hospitals, ambulances, and patient handoffs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><NavigationTransition>{children}</NavigationTransition></body>
    </html>
  );
}
