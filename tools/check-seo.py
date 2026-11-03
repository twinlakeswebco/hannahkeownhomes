#!/usr/bin/env python3
"""Check the published static site's metadata and internal destinations, using stdlib only."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://hannahkeownhomes.com/'


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.tags = []
        self.ids = set()
        self.title = ''
        self.schemas = []
        self.headings = []
        self.capture = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append((tag, attrs))
        if attrs.get('id'):
            self.ids.add(attrs['id'])
        if re.fullmatch('h[1-6]', tag):
            self.headings.append(int(tag[1]))
        if tag == 'title':
            self.capture = 'title'
        elif tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.capture = 'schema'
            self.schemas.append('')

    def handle_endtag(self, tag):
        if tag in ('title', 'script'):
            self.capture = None

    def handle_data(self, text):
        if self.capture == 'title':
            self.title += text
        elif self.capture == 'schema':
            self.schemas[-1] += text

    def select(self, tag, attr=None, value=None):
        return [a for t, a in self.tags if t == tag and (attr is None or a.get(attr) == value)]

    def meta(self, name):
        return [a.get('content', '') for t, a in self.tags if t == 'meta' and (a.get('name') == name or a.get('property') == name)]


pages = {p: Page(p.read_text()) for p in ROOT.rglob('*.html')
         if not any(x.startswith('.') or x in ('tools', 'node_modules') for x in p.relative_to(ROOT).parts)
         and p.name != '__qa.html'}
errors = []
indexable = set()
titles, descriptions = set(), set()
for path, page in pages.items():
    rel = path.relative_to(ROOT).as_posix()
    url = BASE + rel.removesuffix('index.html')
    public = not any('noindex' in x.lower() for x in page.meta('robots'))
    if public:
        indexable.add(url)
        if not page.title or page.title in titles:
            errors.append(f'{rel}: missing or duplicate title')
        titles.add(page.title)
        desc = page.meta('description')
        if len(desc) != 1 or not desc[0] or desc[0] in descriptions:
            errors.append(f'{rel}: missing or duplicate description')
        descriptions.update(desc)
        if page.headings.count(1) != 1:
            errors.append(f'{rel}: expected one H1')
        if any(b > a + 1 for a, b in zip(page.headings, page.headings[1:])):
            errors.append(f'{rel}: skipped heading level')
        canonical = page.select('link', 'rel', 'canonical')
        if len(canonical) != 1 or canonical[0].get('href') != url:
            errors.append(f'{rel}: canonical does not match final URL')
        for key in ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']:
            values = page.meta(key)
            if len(values) != 1 or not values[0]:
                errors.append(f'{rel}: missing or duplicate {key}')
        for image in page.meta('og:image') + page.meta('twitter:image'):
            asset = urlsplit(image)
            target = ROOT / unquote(asset.path.lstrip('/'))
            if asset.scheme != 'https' or asset.hostname != 'hannahkeownhomes.com' or not target.is_file() or not target.stat().st_size:
                errors.append(f'{rel}: invalid social image {image}')
        if page.meta('og:url') != [url]:
            errors.append(f'{rel}: og:url differs from canonical')
        if not page.schemas:
            errors.append(f'{rel}: missing structured data')
        for raw in page.schemas:
            try:
                data = json.loads(raw)
                assert data['@context'] == 'https://schema.org'
                assert any(x.get('@id') == url + '#webpage' for x in data['@graph'])
            except (ValueError, KeyError, AssertionError):
                errors.append(f'{rel}: invalid structured data')
    for tag, attrs in page.tags:
        if tag == 'img':
            if 'alt' not in attrs:
                errors.append(f'{rel}: missing image alt')
            if public and not (attrs.get('width') and attrs.get('height')):
                errors.append(f'{rel}: image has no reserved dimensions')
        ref = attrs.get('href') if tag in ('a', 'link') else attrs.get('src') if tag in ('img', 'script', 'iframe') else None
        if not ref:
            continue
        resolved = urlsplit(urljoin(url, ref))
        if resolved.hostname not in ('hannahkeownhomes.com', 'www.hannahkeownhomes.com'):
            continue
        if resolved.scheme != 'https' or resolved.hostname.startswith('www.'):
            errors.append(f'{rel}: noncanonical internal reference {ref}')
        target = ROOT / unquote(resolved.path.lstrip('/'))
        if not target.suffix:
            target /= 'index.html'
        if not target.is_file():
            errors.append(f'{rel}: missing destination {ref}')
        elif not target.stat().st_size:
            errors.append(f'{rel}: empty destination {ref}')
        elif resolved.fragment and target in pages and unquote(resolved.fragment) not in pages[target].ids:
            errors.append(f'{rel}: missing anchor {ref}')
        if tag == 'img' and 'srcset' in attrs:
            for candidate in attrs['srcset'].split(','):
                image_path = urlsplit(urljoin(url, candidate.strip().split()[0])).path
                variant = ROOT / unquote(image_path.lstrip('/'))
                if not variant.is_file() or not variant.stat().st_size:
                    errors.append(f'{rel}: missing responsive image {image_path}')

# A 200 response alone does not make an image usable. Catch truncated WebP assets.
for asset in list((ROOT / 'assets/images').glob('*.webp')) + list((ROOT / 'testimonials').glob('*.webp')):
    data = asset.read_bytes()
    if len(data) < 12 or data[:4] != b'RIFF' or data[8:12] != b'WEBP' or int.from_bytes(data[4:8], 'little') + 8 != len(data):
        errors.append(f'{asset.relative_to(ROOT)}: incomplete WebP image')

sitemap = ET.parse(ROOT / 'sitemap.xml')
locations = [x.text for x in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
if len(locations) != len(set(locations)) or set(locations) != indexable:
    errors.append(f'Sitemap differs from indexable pages: {set(locations) ^ indexable}')
if 'Sitemap: ' + BASE + 'sitemap.xml' not in (ROOT / 'robots.txt').read_text():
    errors.append('robots.txt does not advertise the canonical sitemap')
if (ROOT / 'CNAME').read_text().strip() != 'hannahkeownhomes.com':
    errors.append('CNAME does not match the canonical hostname')
if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(pages)} documents; {len(indexable)} indexable canonical URLs; metadata, headings, schema JSON, images, links, and sitemap agree.')
