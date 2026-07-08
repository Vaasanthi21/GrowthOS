"use client"
import { Link } from "react-router-dom";
import { FileText, ArrowRight, Sparkles, Search } from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";
import { POSTS } from "@/data/blogPosts";

export default function BlogPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "CreativeOS Blog",
    url: typeof window !== "undefined" ? `${window.location.origin}/blog` : undefined,
    blogPost: POSTS.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.excerpt,
      datePublished: p.date,
      url: typeof window !== "undefined" ? `${window.location.origin}/blog/${p.slug}` : undefined,
    })),
  };

  return (
    <PageShell testid="blog-page">
      <SEO
        title="Blog — Marketing, SEO & AI content strategy"
        description="Ideas, playbooks and case studies from the CreativeOS team on AI content, SEO, AEO and LinkedIn growth."
        path="/blog"
        jsonLd={jsonLd}
      />

      <section className="mx-auto max-w-5xl px-5 pt-32 pb-8 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs text-neutral-300">
          <FileText className="h-3.5 w-3.5 text-orange-500" /> The CreativeOS Blog
        </span>
        <h1 className="mt-6 text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-white md:text-6xl">
          Ideas that <span className="text-orange-500">rank</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-400">
          Playbooks on AI content, SEO, AEO and how to Save 💾 and Grow — from the team building CreativeOS.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mx-auto mb-8 flex max-w-lg items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5">
          <Search className="h-4 w-4 text-orange-500" />
          <input
            data-testid="blog-search-input"
            placeholder="Search articles..."
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {POSTS.map((p, i) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              data-testid={`blog-card-${i}`}
              className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:-translate-y-1 hover:border-orange-500/30"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-orange-300">
                  {p.tag}
                </span>
                <span className="font-mono text-[11px] text-neutral-500">{p.date}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold leading-snug text-white transition-colors group-hover:text-orange-100">
                {p.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-400">{p.excerpt}</p>
              <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                <span className="font-mono text-[11px] text-neutral-500">{p.read} read</span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-400">
                  Read
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <Link
            to="/signup"
            data-testid="blog-cta-signup"
            className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            <Sparkles className="h-4 w-4" /> Try CreativeOS free
          </Link>
        </div>
      </section>
    </PageShell>
  );
}