/* McGuire Real Estate shared marketing catalogue: used by the packages page and the onboarding system.
   Edit prices here once and both update. */
/* Price catalogue (all prices incl. GST, current to October 2026) ── */
var CATALOGUE = [
  { sec: 'Always included', note: 'No charge', items: [
    { id: 'idv',      name: 'ID verification (AML)', sup: 'Halo AML Systems', fixed: true },
    { id: 'title',    name: 'Title search', sup: 'Land Information NZ', fixed: true },
    { id: 'agentph',  name: 'Agent photography', sup: 'Your agent', fixed: true },
    { id: 'stdsign',  name: 'Standard 800×1200mm For Sale sign', sup: 'Williams Signs', fixed: true },
    { id: 'pointers', name: 'Open home pointers', sup: 'Your agent', fixed: true },
    { id: 'landing',  name: 'Dedicated landing page', sup: 'mcguire.co.nz', fixed: true },
    { id: 'portals',  name: 'NZ and international portal listings', sup: 'realestate.co.nz, realestate.com.au, realtor.com, housing.com, thinkofliving.com and more', fixed: true },
  ]},
  { sec: 'Essentials', items: [
    { id: 'lim',       name: 'LIM report', desc: 'Required for every campaign', sup: 'Dunedin City Council', price: 425, required: true },
    { id: 'photosign', name: 'Custom photo signage', desc: 'Photo-printed 800×1200mm sign', sup: 'Williams Signs', price: 135 },
    { id: 'brochures', name: 'Premium brochures', desc: '100+ printed brochures', sup: 'Speedprint', price: 100 },
    { id: 'flyers',    name: 'Premium flyers delivered', desc: '500+ flyers to the local area', sup: 'Speedprint', price: 300 },
    { id: 'tour3d',    name: '3D tour and floor plans', desc: 'Based on 3 bedrooms', sup: 'Nudge Marketing', price: 172 },
    { id: 'rooms',     name: 'Additional rooms for 3D tour', sup: 'Nudge Marketing', price: 15, qty: true, max: 10, unit: ['room', 'rooms'] },
  ]},
  { sec: 'Trade Me', note: 'Platinum price set by expected sale price', items: [
    { id: 'tm_lo',  group: 'trademe', name: 'Trade Me Platinum listing', desc: 'Expected sale price up to $400,000', sup: 'Trade Me', price: 799 },
    { id: 'tm_mid', group: 'trademe', name: 'Trade Me Platinum listing', desc: 'Expected sale price $400,001 to $1,000,000', sup: 'Trade Me', price: 899 },
    { id: 'tm_hi',  group: 'trademe', name: 'Trade Me Platinum listing', desc: 'Expected sale price over $1,000,000', sup: 'Trade Me', price: 999 },
    { id: 'audience', name: 'Trade Me Audience Boost', desc: 'Extra exposure for your Trade Me listing', sup: 'Trade Me', price: 199 },
  ]},
  { sec: 'realestate.co.nz upgrades', note: 'Standard listing included. Choose one upgrade', items: [
    { id: 'rc_bronze', group: 'rc', name: 'realestate.co.nz Bronze', desc: 'Feature until sold, Showcase Carousel 3 weeks, 3 refreshes', sup: 'realestate.co.nz', price: 289 },
    { id: 'rc_silver', group: 'rc', name: 'realestate.co.nz Silver', desc: 'Premium Feature 4 weeks, Feature until sold, Showcase Carousel 4 weeks, 4 refreshes', sup: 'realestate.co.nz', price: 275 },
    { id: 'rc_gold',   group: 'rc', name: 'realestate.co.nz Gold', desc: 'Premium Feature 6 weeks, Feature until sold, Showcase Carousel 6 weeks, 12 refreshes', sup: 'realestate.co.nz', price: 449 },
    { id: 'rc_plat',   group: 'rc', name: 'realestate.co.nz Platinum', desc: 'Premium Feature and Showcase Carousel until sold, 19 refreshes over 8 weeks, Digital Exposure included', sup: 'realestate.co.nz', price: 849 },
    { id: 'rc_dx', name: 'realestate.co.nz Digital Exposure', desc: 'Promotes your listing on Google, Facebook and Instagram. Add to Bronze, Silver or Gold', sup: 'realestate.co.nz', dynamic: true },
  ]},
  { sec: 'Professional media', note: 'Choose one', items: [
    { id: 'm_launch', group: 'media', name: 'Professional photography', desc: '15 images, a drone hero shot and a 2D floor plan', sup: 'Momentum Agency', price: 345 },
    { id: 'm_pv',     group: 'media', name: 'Photo and video package', desc: 'Photography, premium video, aerial photos and flyover', sup: 'Momentum Agency', price: 971.75 },
    { id: 'm_full',   group: 'media', name: 'Photo, video and social ad formats', desc: 'Full media package with video reels for social campaigns', sup: 'Momentum Agency', price: 1190.25 },
  ]},
  { sec: 'Media extras', items: [
    { id: 'x_drone',    name: 'Drone photography and flyover video', desc: '6 to 10 drone images plus flyover', sup: 'Momentum Agency', price: 172.50 },
    { id: 'x_video',    name: 'Premium video tour', desc: 'Standard, drone and agent piece to camera', sup: 'Momentum Agency', price: 747.50 },
    { id: 'x_twilight', name: 'Twilight photography', desc: '6 to 10 edited twilight images', sup: 'Momentum Agency', price: 299 },
    { id: 'x_extra10',  name: 'Extra 10 images', sup: 'Momentum Agency', price: 103.50 },
    { id: 'x_section',  name: 'Section package', desc: 'Drone flyover, graphics and aerial photography', sup: 'Momentum Agency', price: 373.75 },
    { id: 'x_staging',  name: 'Virtual staging', sup: 'Momentum Agency', price: 69, qty: true, max: 20, unit: ['photo', 'photos'] },
  ]},
  { sec: 'Social media campaign', note: 'Choose one', items: [
    { id: 's1', group: 'social', name: '1-week social campaign', desc: 'YouTube, Google, Instagram, Facebook, Messenger and WhatsApp', sup: 'Reach', price: 220 },
    { id: 's2', group: 'social', name: '2-week social campaign', desc: 'YouTube, Google, Instagram, Facebook, Messenger and WhatsApp', sup: 'Reach', price: 385 },
    { id: 's3', group: 'social', name: '3-week social campaign', desc: 'YouTube, Google, Instagram, Facebook, Messenger and WhatsApp', sup: 'Reach', price: 600 },
  ]},
  { sec: 'Print media', note: 'Per issue', items: [
    { id: 'star4',    name: 'The Star, quarter page', sup: 'Allied Media', price: 379.50,  qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'star2',    name: 'The Star, half page',    sup: 'Allied Media', price: 764.75,  qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'starfull', name: 'The Star, full page',    sup: 'Allied Media', price: 1529.50, qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'odt8',     name: 'ODT, eighth page',       sup: 'Allied Media', price: 805,     qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'odt4',     name: 'ODT, quarter page',      sup: 'Allied Media', price: 1505.35, qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'odt2',     name: 'ODT, half page',         sup: 'Allied Media', price: 2833.60, qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'odtfull',  name: 'ODT, full page',         sup: 'Allied Media', price: 5313,    qty: true, max: 4, unit: ['issue', 'issues'] },
    { id: 'community', name: 'Community paper', sup: 'Allied Media', poa: true },
  ]},
  { sec: 'Featured', note: 'Quoted on request', items: [
    { id: 'storyvideo', name: 'Storyboarded video', desc: 'Interviews and extended tours', sup: 'Nudge Marketing or Momentum Agency', poa: true },
    { id: 'tv',         name: 'Television advertising', desc: 'TVNZ and TVNZ+ On Demand', sup: 'TVNZ', poa: true },
  ]},
];

var ITEMS = {};
CATALOGUE.forEach(s => s.items.forEach(i => { i.sec = s.sec; ITEMS[i.id] = i; }));

var BASE = { lim: 1, photosign: 1, TM: 1, audience: 1, brochures: 1, flyers: 1, tour3d: 1 };
var DX_PRICE = { rc_bronze: 199, rc_silver: 149, rc_gold: 99 };

var PACKAGES = {
  digital: { name: 'Digital', price: 3000, tagline: 'Everything you need to launch your property online, across New Zealand and key international markets.',
    items: { ...BASE, rc_bronze: 1, m_launch: 1, s2: 1 } },
  premium: { name: 'Premium', price: 6000, tagline: 'Professional photo and video, combined with targeted print and social to maximise reach.',
    items: { ...BASE, rc_silver: 1, rc_dx: 1, m_pv: 1, s2: 1, star4: 2, star2: 2 } },
  elite: { name: 'Elite', price: 11000, tagline: 'Full media production, a strong print presence and an extended social campaign.',
    items: { ...BASE, rc_plat: 1, m_full: 1, s3: 1, star4: 1, star2: 1, starfull: 1, odt8: 1, odt4: 1, odt2: 1 } },
};

