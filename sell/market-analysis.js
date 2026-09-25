(() => {
  const form = document.getElementById('market-analysis-form');
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('market-analysis-status');
  const year = form.elements.namedItem('year_built');
  year.max = String(new Date().getFullYear() + 1);
  let pending = false;

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    if (form.elements.namedItem('botcheck').checked) return;
    const data = Object.fromEntries(new FormData(form));
    data.text_consent = form.elements.namedItem('text_consent').checked ? 'Yes' : 'No';
    data.call_consent = form.elements.namedItem('call_consent').checked ? 'Yes' : 'No';
    data.consent_recorded_at = new Date().toISOString();
    data.name = `${data.first_name} ${data.last_name}`.trim();
    data.replyto = data.email;
    // Retain the precise disclosure shown with each preference in the email record.
    data.text_consent_disclosure = form.elements.namedItem('text_consent').closest('label').textContent.trim();
    data.call_consent_disclosure = form.elements.namedItem('call_consent').closest('label').textContent.trim();
    pending = true;
    button.disabled = true;
    button.textContent = 'Sending your request…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Submitting your market analysis request…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Accept: 'application/json'},
        body: JSON.stringify(data),
        signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Submission not confirmed');
      form.reset();
      status.textContent = 'Thank you! Your request has been submitted. Hannah will review your property details and follow up with you.';
    } catch (error) {
      status.textContent = 'We could not confirm your submission. Your answers are still here. Please try again, or call Hannah at (270) 589-8376 before retrying if you want to avoid a duplicate request.';
    } finally {
      clearTimeout(timeout);
      pending = false;
      button.disabled = false;
      button.textContent = 'Request My Free Market Analysis';
      form.removeAttribute('aria-busy');
      status.focus();
    }
  });
})();
