import { execSync } from 'node:child_process'
import type { HtmlTagDescriptor, Plugin } from 'vite'
import {
  APP_AUTHOR,
  APP_DESCRIPTION,
  APP_KEYWORDS,
  APP_NAME,
  APP_TITLE,
  DEFAULT_SITE_URL,
} from './src/app/brand.ts'

export interface SeoOptions {
  /** Canonical origin, no trailing slash. */
  siteUrl?: string
  /** Google Analytics 4 measurement ID (`G-XXXXXXXXXX`). Analytics is off when unset. */
  gaId?: string
}

const OG_IMAGE = '/og-image.png'
const OG_IMAGE_ALT = 'QisPlay: a Python and Qiskit playground that runs in your browser'

/** `lastmod` should reflect real changes, so use the last commit, not the build clock. */
function lastModified(): string {
  try {
    const iso = execSync('git log -1 --format=%cI', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    if (iso) return iso
  } catch {
    // Not a git checkout (e.g. a source tarball).
  }
  return new Date().toISOString()
}

const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
  tag: 'meta',
  attrs,
  injectTo: 'head',
})

/**
 * Build-time SEO: replaces `%APP_TITLE%` / `%APP_DESCRIPTION%` in index.html, injects
 * canonical + Open Graph + Twitter + JSON-LD tags and the optional Google Analytics 4
 * snippet, and emits `sitemap.xml` and `robots.txt` into the build output.
 */
export function seo({ siteUrl: configuredUrl, gaId }: SeoOptions = {}): Plugin {
  const origin = (configuredUrl || DEFAULT_SITE_URL).replace(/\/+$/, '')
  const home = `${origin}/`
  const image = `${origin}${OG_IMAGE}`
  let isBuild = false

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${home}#website`,
        url: home,
        name: APP_NAME,
        description: APP_DESCRIPTION,
        inLanguage: 'en',
      },
      {
        '@type': 'WebApplication',
        '@id': `${home}#app`,
        url: home,
        name: APP_NAME,
        description: APP_DESCRIPTION,
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: 'Code editor',
        operatingSystem: 'Any',
        browserRequirements: 'Requires a modern browser with JavaScript enabled',
        isAccessibleForFree: true,
        image,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        author: { '@type': 'Person', name: APP_AUTHOR },
        isPartOf: { '@id': `${home}#website` },
      },
    ],
  }

  return {
    name: 'qisplay-seo',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const tags: HtmlTagDescriptor[] = [
          meta({ name: 'keywords', content: APP_KEYWORDS }),
          meta({ name: 'author', content: APP_AUTHOR }),
          meta({ name: 'robots', content: 'index, follow, max-image-preview:large' }),
          { tag: 'link', attrs: { rel: 'canonical', href: home }, injectTo: 'head' },
          // Open Graph: Facebook, LinkedIn, WhatsApp, Slack, Discord, Telegram, iMessage.
          meta({ property: 'og:type', content: 'website' }),
          meta({ property: 'og:site_name', content: APP_NAME }),
          meta({ property: 'og:locale', content: 'en_US' }),
          meta({ property: 'og:url', content: home }),
          meta({ property: 'og:title', content: APP_TITLE }),
          meta({ property: 'og:description', content: APP_DESCRIPTION }),
          meta({ property: 'og:image', content: image }),
          meta({ property: 'og:image:type', content: 'image/png' }),
          meta({ property: 'og:image:width', content: '1200' }),
          meta({ property: 'og:image:height', content: '630' }),
          meta({ property: 'og:image:alt', content: OG_IMAGE_ALT }),
          // X / Twitter.
          meta({ name: 'twitter:card', content: 'summary_large_image' }),
          meta({ name: 'twitter:title', content: APP_TITLE }),
          meta({ name: 'twitter:description', content: APP_DESCRIPTION }),
          meta({ name: 'twitter:image', content: image }),
          meta({ name: 'twitter:image:alt', content: OG_IMAGE_ALT }),
          // Mobile / PWA.
          meta({ name: 'application-name', content: APP_NAME }),
          meta({ name: 'apple-mobile-web-app-title', content: APP_NAME }),
          meta({ name: 'mobile-web-app-capable', content: 'yes' }),
          {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: JSON.stringify(jsonLd),
            injectTo: 'head',
          },
        ]

        if (isBuild && gaId) {
          // Direct GA4 (gtag.js) rather than Tag Manager: GTM can load arbitrary
          // third-party tags, which cross-origin isolation (COEP) would block.
          // Skipped for visitors sending Do Not Track / Global Privacy Control.
          tags.push(
            {
              tag: 'script',
              attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${gaId}` },
              injectTo: 'head',
            },
            {
              tag: 'script',
              children: `(function(){var n=navigator;
if(n.doNotTrack==="1"||window.doNotTrack==="1"||n.globalPrivacyControl){window["ga-disable-${gaId}"]=true;return}
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
window.gtag=gtag;gtag("js",new Date());gtag("config","${gaId}")})();`,
              injectTo: 'head',
            },
          )
        }

        return {
          html: html
            .replaceAll('%APP_TITLE%', APP_TITLE)
            .replaceAll('%APP_DESCRIPTION%', APP_DESCRIPTION),
          tags,
        }
      },
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${home}</loc>
    <lastmod>${lastModified()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <image:image><image:loc>${image}</image:loc></image:image>
  </url>
</urlset>
`,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *
Allow: /
# Runtime and package files are only fetched by the app itself.
Disallow: /pyodide/
Disallow: /wheels/

Sitemap: ${origin}/sitemap.xml
`,
      })
    },
  }
}
