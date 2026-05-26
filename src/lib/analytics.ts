export function trackEvent(category: string, action: string, label?: string) {
  try {
    const events = JSON.parse(localStorage.getItem('solar-analytics') || '[]');
    events.push({ category, action, label, timestamp: Date.now() });
    if (events.length > 100) events.shift();
    localStorage.setItem('solar-analytics', JSON.stringify(events));
  } catch {
    // silent fail
  }

  if (import.meta.env.DEV) {
    console.log('📊 Event:', { category, action, label });
  }
}