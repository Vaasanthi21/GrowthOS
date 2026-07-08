"use client"
import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";

export default function NotFoundPage() {
  return (
    <PageShell testid="not-found-page">
      <SEO title="Page not found" description="This page doesn't exist. Head back to CreativeOS." path="/404" />
      <section className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-5 text-center">
        <div className="font-mono text-[10rem] font-black leading-none text-orange-500/20">404</div>
        <h1 className="mt-2 text-3xl font-bold text-white md:text-4xl">Nothing to render here.</h1>
        <p className="mt-3 max-w-md text-neutral-400">
          The page you&apos;re looking for doesn&apos;t exist yet. Let&apos;s get you back on track.
        </p>
        <Link
          to="/"
          data-testid="not-found-home-link"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          <Home className="h-4 w-4" /> Back to home
        </Link>
      </section>
    </PageShell>
  );
}