"use client"

import { Nav, Footer } from "../pages/LandingPage"

export default function PageShell({ children, testid }) {
  return (
    <div
      data-testid={testid}
      className="min-h-screen bg-[#0a0705] font-sans text-neutral-200 antialiased selection:bg-orange-500/30"
    >
      <Nav />
      <main className="pointer-events-none relative z-10 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto [&_select]:pointer-events-auto [&_textarea]:pointer-events-auto [&_form]:pointer-events-auto">
        {children}
      </main>
      <Footer />
    </div>
  )
}