"use client"

import { useEffect } from "react"

const SITE_NAME = "CreativeOS"
const SITE_URL = "https://www.udenai.com/"

function upsertMeta(attr, key, content) {
  if (!content) return
  let tag = document.querySelector(`meta[${attr}="${key}"]`)
  if (!tag) {
    tag = document.createElement("meta")
    tag.setAttribute(attr, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute("content", content)
}

function upsertLink(rel, href) {
  if (!href) return
  let tag = document.querySelector(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement("link")
    tag.setAttribute("rel", rel)
    document.head.appendChild(tag)
  }
  tag.setAttribute("href", href)
}

function upsertJsonLd(id, data) {
  let tag = document.getElementById(id)
  if (!data) {
    if (tag) tag.remove()
    return
  }
  if (!tag) {
    tag = document.createElement("script")
    tag.id = id
    tag.type = "application/ld+json"
    document.head.appendChild(tag)
  }
  tag.textContent = JSON.stringify(data)
}

export default function SEO({ title, description, path, jsonLd }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME
    document.title = fullTitle

    upsertMeta("name", "description", description)
    upsertMeta("property", "og:title", fullTitle)
    upsertMeta("property", "og:description", description)
    upsertMeta("property", "og:type", "website")
    upsertMeta("name", "twitter:card", "summary_large_image")
    upsertMeta("name", "twitter:title", fullTitle)
    upsertMeta("name", "twitter:description", description)

    if (path) {
      const url = `${SITE_URL}${path}`
      upsertLink("canonical", url)
      upsertMeta("property", "og:url", url)
    }

    upsertJsonLd("seo-jsonld", jsonLd)

    return () => {
      const ld = document.getElementById("seo-jsonld")
      if (ld) ld.remove()
    }
  }, [title, description, path, jsonLd])

  return null
}