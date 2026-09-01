import { site } from '../site';

export interface Faq {
  q: string;
  a: string;
}

export const faqs: Faq[] = [
  {
    q: 'Will it actually match my style?',
    a: 'It learns from you. Every outfit you wear and every one you skip tunes the next morning’s four. Most people notice sharper picks within the first week.',
  },
  {
    q: 'What if I only own about twenty things?',
    a: 'That is plenty. Styleum is built to find combinations you have not tried, not to make you buy more. The free plan holds 50 items and Pro is unlimited.',
  },
  {
    q: 'How long does setup take?',
    a: 'About two minutes. Photograph your clothes, one piece per photo. The background is removed and each item is named and tagged automatically. Add more whenever you like.',
  },
  {
    q: 'Does Styleum see my whole photo library?',
    a: 'No. It only receives the photos you choose to add. Camera and photo access are used for that and nothing else.',
  },
  {
    q: 'Are my photos used to train AI?',
    a: 'Never. Your wardrobe photos are processed only to build your outfits and are not used to train any models. The privacy policy lists every service involved and what it sees.',
  },
  {
    q: 'Which phones does it run on?',
    a: `${site.app.platform}. Styleum is built for iOS and billed through the App Store. Pro is ${site.pro.price} a ${site.pro.period} and you can cancel any time in Settings.`,
  },
];
