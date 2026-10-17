(() => {
  const guides = Object.freeze({
    buyer: {
      title: 'Buyer’s Guide',
      description: 'From preparation and financing through inspections and closing. Enter your email to open your free guide.',
      url: '/buy/buyer-guide.pdf'
    },
    seller: {
      title: 'Seller’s Guide',
      description: 'Pricing, preparation, marketing, offers, and the road to closing. Enter your email to open your free guide.',
      url: '/sell/seller-guide.pdf'
    },
    ultimate: {
      title: 'Ultimate Guide to Buy and Sell',
      description: 'Coordinate buying and selling without losing sight of either move. Enter your email to open your free guide.',
      url: '/resources/Ultimate-guide-to-buy%26sell.pdf'
    }
  });
  const form = document.getElementById('guide-request-form');
  if (!form) return;
  const choice = form.elements.namedItem('guide');
  const email = form.elements.namedItem('email');
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('guide-status');
  const reader = document.getElementById('guide-reader');
  const frame = document.getElementById('guide-frame');
  const readerStatus = document.getElementById('guide-reader-status');
  let readerTimeout;
  const sizeReader = () => {
    if (!reader.hidden) frame.style.height = `${Math.max(320, innerHeight - Math.max(80, frame.getBoundingClientRect().top) - 16)}px`;
  };
  window.addEventListener('resize', sizeReader);
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow ||
        event.data?.type !== 'hkh-guide-ready' || event.data.guide !== window.hkhGuideAccess) return;
    clearTimeout(readerTimeout);
    readerStatus.textContent = 'Use the arrows or swipe to turn pages. Zoom in for a closer look.';
    frame.hidden = false;
  });
  const showReader = (guide, id) => {
    window.hkhGuideAccess = id;
    document.getElementById('guide-reader-title').textContent = guide.title;
    document.getElementById('guide-pdf').href = guide.url;
    document.querySelector('.guide-layout').hidden = true;
    reader.hidden = false;
    frame.title = `${guide.title}, interactive flipbook`;
    frame.hidden = false;
    readerStatus.textContent = 'Loading your guide…';
    frame.src = `/resources/flipbooks/${id}/`;
    document.getElementById('guide-reader-title').focus({ preventScroll: true });
    reader.scrollIntoView({ block: 'start', behavior: 'instant' });
    sizeReader();
    readerTimeout = setTimeout(() => {
      readerStatus.textContent = 'The flipbook is taking longer to load. You can open the PDF below.';
    }, 30000);
  };
  const getGuide = key => Object.hasOwn(guides, key) ? guides[key] : null;
  let pending = false;

  const updateGuide = () => {
    const guide = getGuide(choice.value);
    document.getElementById('guide-title').textContent = guide ? guide.title : 'Your next move starts here.';
    document.getElementById('guide-description').textContent = guide ? guide.description : 'Choose a guide and enter your email to access practical advice for buying or selling in Central Kentucky.';
    status.textContent = '';
  };
  const requested = new URLSearchParams(location.search).get('guide');
  if (getGuide(requested)) choice.value = requested;
  updateGuide();
  button.disabled = false;
  choice.addEventListener('change', updateGuide);
  email.addEventListener('input', () => email.setCustomValidity(''));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    email.value = email.value.trim();
    email.setCustomValidity('');
    if (email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      email.setCustomValidity('Enter a complete email address, such as you@example.com.');
    }
    if (!form.reportValidity()) return;
    const guide = getGuide(choice.value);
    if (!guide || form.elements.namedItem('botcheck').checked) return;
    const payload = {
      access_key: form.elements.namedItem('access_key').value,
      from_name: form.elements.namedItem('from_name').value,
      email: email.value,
      subject: `Guide request: ${guide.title} | Hannah Keown Homes`,
      guide: guide.title,
      guide_id: choice.value,
      requested_at: new Date().toISOString(),
      source_page: location.pathname,
      botcheck: false
    };
    try {
      const referrer = new URL(document.referrer);
      if (referrer.origin === location.origin) payload.referring_page = referrer.pathname;
    } catch { /* A direct visit has no referring page. */ }
    pending = true;
    button.disabled = true;
    choice.disabled = true;
    email.readOnly = true;
    button.textContent = 'Submitting…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Submitting your guide request…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Submission not confirmed');
      status.textContent = 'Your request was received.';
      showReader(guide, choice.value);
    } catch {
      status.textContent = 'We could not confirm your request. Your email is still here. Please try again, or contact Hannah at (270) 589-8376 for your guide.';
      status.focus();
    } finally {
      clearTimeout(timeout);
      pending = false;
      button.disabled = false;
      choice.disabled = false;
      email.readOnly = false;
      button.textContent = 'Open my free guide';
      form.removeAttribute('aria-busy');
    }
  });
})();
