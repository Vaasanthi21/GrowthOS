"use client"
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Sparkles, FileText } from "lucide-react";
import PageShell from "@/components/PageShell";
import SEO from "@/components/SEO";
import { POSTS, POST_CONTENT } from "@/data/blogPosts";

/* ---------------------------------------------------------
   Tiny markdown renderer, scoped to the shapes our own
   articles use: ## / ### headings, **bold**, [text](url)
   links, "- " bullet lists, "1. " numbered lists, and
   ![alt](src) images. Not a general-purpose parser.
--------------------------------------------------------- */

function parseInline(text, keyPrefix) {
  const nodes = [];
  const regex = /(\*\*(.+?)\*\*)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-white">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      const isInternal = match[5].startsWith("/");
      nodes.push(
        isInternal ? (
          <Link
            key={`${keyPrefix}-a-${i}`}
            to={match[5]}
            className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
          >
            {match[4]}
          </Link>
        ) : (
          <a
            key={`${keyPrefix}-a-${i}`}
            href={match[5]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
          >
            {match[4]}
          </a>
        )
      );
    }
    lastIndex = regex.lastIndex;
    i++;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function parseBlocks(markdown) {
  const rawBlocks = markdown.trim().split(/\n\s*\n/);
  const blocks = [];

  rawBlocks.forEach((raw) => {
    const lines = raw.split("\n").map((l) => l.replace(/\s+$/, ""));
    const first = lines[0].trim();

    if (first.startsWith("### ")) {
      blocks.push({ type: "h3", text: first.slice(4) });
    } else if (first.startsWith("## ")) {
      blocks.push({ type: "h2", text: first.slice(3) });
    } else if (/^!\[.*?\]\(.*?\)/.test(first)) {
      const m = first.match(/!\[(.*?)\]\((.*?)\)/);
      blocks.push({ type: "img", alt: m?.[1] || "", src: m?.[2] || "" });
    } else if (/^-\s/.test(first)) {
      const items = [];
      let current = null;
      lines.forEach((l) => {
        const t = l.trim();
        if (/^-\s/.test(t)) {
          if (current) items.push(current);
          current = t.replace(/^-\s/, "");
        } else if (current && t) {
          current += " " + t;
        }
      });
      if (current) items.push(current);
      blocks.push({ type: "ul", items });
    } else if (/^\d+\.\s/.test(first)) {
      const items = [];
      let current = null;
      lines.forEach((l) => {
        const t = l.trim();
        if (/^\d+\.\s/.test(t)) {
          if (current) items.push(current);
          current = t.replace(/^\d+\.\s/, "");
        } else if (current && t) {
          current += " " + t;
        }
      });
      if (current) items.push(current);
      blocks.push({ type: "ol", items });
    } else {
      blocks.push({ type: "p", text: lines.map((l) => l.trim()).join(" ") });
    }
  });

  return blocks;
}

function ArticleBody({ markdown }) {
  const blocks = parseBlocks(markdown);
  return (
    <div className="prose-none">
      {blocks.map((b, i) => {
        if (b.type === "h2") {
          return (
            <h2 key={i} className="mt-12 text-2xl font-bold text-white md:text-3xl">
              {parseInline(b.text, `h2-${i}`)}
            </h2>
          );
        }
        if (b.type === "h3") {
          return (
            <h3 key={i} className="mt-8 text-xl font-semibold text-white">
              {parseInline(b.text, `h3-${i}`)}
            </h3>
          );
        }
        if (b.type === "img") {
          return (
            <img
              key={i}
              src={b.src}
              alt={b.alt}
              className="mt-8 w-full rounded-2xl border border-white/10"
            />
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={i} className="mt-4 space-y-2.5 pl-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-neutral-300">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span>{parseInline(item, `ul-${i}-${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={i} className="mt-4 space-y-3 pl-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3 text-neutral-300">
                  <span className="mt-0.5 shrink-0 font-mono text-sm text-orange-400">
                    {String(j + 1).padStart(2, "0")}
                  </span>
                  <span>{parseInline(item, `ol-${i}-${j}`)}</span>
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i} className="mt-4 leading-relaxed text-neutral-300">
            {parseInline(b.text, `p-${i}`)}
          </p>
        );
      })}
    </div>
  );
}

export default function BlogPostPage() {
  const { slug } = useParams();
  const meta = POSTS.find((p) => p.slug === slug);
  const content = POST_CONTENT[slug];

  if (!meta || !content) {
    return (
      <PageShell testid="blog-post-not-found">
        <SEO title="Post not found" path={`/blog/${slug || ""}`} />
        <section className="mx-auto max-w-2xl px-5 pt-40 pb-24 text-center">
          <h1 className="text-3xl font-bold text-white">This post doesn&apos;t exist</h1>
          <p className="mt-3 text-neutral-400">
            It may have moved, or the link is out of date.
          </p>
          <Link
            to="/blog"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back to the blog
          </Link>
        </section>
      </PageShell>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: meta.title,
    description: meta.excerpt,
    datePublished: meta.date,
    image: content.cover || undefined,
  };

  return (
    <PageShell testid="blog-post-page">
      <SEO
        title={`${meta.title} — CreativeOS Blog`}
        description={meta.excerpt}
        path={`/blog/${slug}`}
        jsonLd={jsonLd}
      />

      <article className="mx-auto max-w-3xl px-5 pt-32 pb-24">
        <Link
          to="/blog"
          data-testid="blog-post-back"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 transition hover:text-orange-400"
        >
          <ArrowLeft className="h-4 w-4" /> Back to the blog
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-orange-300">
            {meta.tag}
          </span>
          <span className="font-mono text-[11px] text-neutral-500">{meta.date}</span>
          <span className="font-mono text-[11px] text-neutral-500">· {meta.read} read</span>
        </div>

        <h1 className="mt-4 text-balance text-3xl font-extrabold leading-[1.1] tracking-tight text-white md:text-5xl">
          {meta.title}
        </h1>
        <p className="mt-4 text-lg text-neutral-400">{meta.excerpt}</p>

        {content.cover && (
          <img
            src={content.cover}
            alt={meta.title}
            className="mt-10 w-full rounded-2xl border border-white/10"
          />
        )}

        <ArticleBody markdown={content.body} />

        <div className="mt-16 flex flex-col items-center gap-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.05] px-8 py-10 text-center">
          <FileText className="h-8 w-8 text-orange-500" />
          <h3 className="text-xl font-bold text-white">
            Put this into practice with CreativeOS
          </h3>
          <p className="max-w-md text-sm text-neutral-400">
            Draft, score, and publish content like this across every studio —
            without switching tools.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup"
              data-testid="blog-post-cta-signup"
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              <Sparkles className="h-4 w-4" /> Try CreativeOS free
            </Link>
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              More articles <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </article>
    </PageShell>
  );
}