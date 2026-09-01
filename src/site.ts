/**
 * Single source of truth for site-wide facts.
 * Every call to action on the site reads from `cta`, so the store link lives here once.
 */
export const site = {
  name: 'Styleum',
  storeName: 'Styleum: Daily Fits',
  url: 'https://styleum.xyz',
  tagline: 'Wake up styled.',
  description:
    'Styleum builds four outfits from the clothes you already own and delivers them to your iPhone at 9:00 every morning. Weather-checked, learns your taste, nothing to buy.',
  company: 'Sameer Studios LLC',
  email: 'support.styleum@sameerstudios.com',
  social: {
    instagram: 'https://instagram.com/styleum',
    tiktok: 'https://tiktok.com/@styleum',
  },
  ritualTime: '9:00',
  app: {
    available: true,
    storeUrl: 'https://apps.apple.com/us/app/styleum-daily-fits/id6757777880',
    platform: 'iPhone',
  },
  pro: {
    price: '$9.99',
    period: 'month',
  },
} as const;

const launchSubject = encodeURIComponent('Tell me when Styleum launches');
const launchBody = encodeURIComponent('Add me to the launch list. I want the first four looks at 9:00.');

export const cta = site.app.available && site.app.storeUrl
  ? {
      href: site.app.storeUrl,
      label: 'Download on the App Store',
      short: 'Get the app',
      external: true,
      apple: true,
      note: `Free on ${site.app.platform}`,
    }
  : {
      href: `mailto:${site.email}?subject=${launchSubject}&body=${launchBody}`,
      label: 'Notify me at launch',
      short: 'Notify me',
      external: false,
      apple: false,
      note: `Coming to ${site.app.platform}. Free to start.`,
    };
