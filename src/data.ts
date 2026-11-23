/* =====================================================================
   EDIT HERE: contact details and the collection.
   Everything marked PLACEHOLDER must be replaced before launch.
   ===================================================================== */
export const CONTACT = {
  whatsapp: '919092248282',             // country code + number, digits only
  phone: '+919092248282',               // used for the call button
  phoneLabel: '+91 90922 48282',
  address: 'Get directions on Google Maps',
  mapsUrl: 'https://maps.app.goo.gl/PU97R3Jrgu9qmCty8',
  bookingUrl: ''                         // PLACEHOLDER: booking page URL. Empty = WhatsApp fitting request
}
export const SAMPLE_PRICES = true        // set to false once real prices are in

export type Img = { src: string; alt: string; source: 'generated' | 'store photo' }
/* Used by the tailor's greeting to open the wardrobe at the right piece. */
export type Category = 'formal' | 'wedding' | 'statement' | 'shirts'
export type Item = {
  category: Category
  name: string; tagline: string; fabric: string; price: number | null
  images: Img[]; colours: { name: string; hex: string }[]
  /* optional photo of the back (transparent cut-out, same framing as public/img/cut/<slug>-1.webp).
     Without it the inspect view shows the shared plain back: the piece's own outline, mirrored, in a plain fabric tone. */
  back?: string
  details: { fit: string; madeToMeasure: string; delivery: string }
  /* set for products that come from the live catalogue (Supabase); bundled items leave them empty */
  slug?: string
  collection?: 'premium' | 'attire'   // premium: vault + grid; attire: grid only
  cut?: string                         // transparent cut-out for the flip view (else the photo itself)
  blur?: string                        // tiny data-URL placeholder
  description?: string
}

const base = import.meta.env.BASE_URL
/* Images live in public/img/<slug>-N.webp. 1 = hero (used in the 3D wardrobe), 2 = detail,
   3 = closer crop of the hero, 4 = crop from the store photo (where the piece is in the window). */
function imgs(slug: string, what: string, storeCrop = false): Img[] {
  const list: Img[] = [
    { src: `${base}img/${slug}-1.webp`, alt: `${what} in the spotlight against red velvet`, source: 'generated' },
    { src: `${base}img/${slug}-2.webp`, alt: `${what}, close-up of the fabric and finishing`, source: 'generated' },
    { src: `${base}img/${slug}-3.webp`, alt: `${what}, closer view of the cut`, source: 'generated' }
  ]
  if (storeCrop) list.push({ src: `${base}img/${slug}-4.webp`, alt: `${what} in The Godfather store window`, source: 'store photo' })
  return list
}

export const ITEMS: Item[] = [
  { category: 'formal', name: 'Three-piece suit', tagline: 'Cut for the long evening.',
    fabric: 'Navy Super 120s worsted wool, half canvas, hand-finished lapels.', price: 85000,
    images: imgs('three-piece', 'Navy three-piece suit on a mannequin', true),
    colours: [{ name: 'Navy', hex: '#1c2238' }, { name: 'Charcoal', hex: '#34353b' }],
    details: { fit: 'Soft shoulder, high armhole, straight trouser.', madeToMeasure: 'Cut to your measurements over two fittings.', delivery: 'Four to six weeks.' } },
  { category: 'statement', name: 'Velvet blazer', tagline: 'Quiet colour, deep pile.',
    fabric: 'Burgundy cotton velvet, peak lapels, lined in silk.', price: 65000,
    images: imgs('velvet-blazer', 'Burgundy velvet blazer on a mannequin', true),
    colours: [{ name: 'Burgundy', hex: '#5e1422' }, { name: 'Bottle green', hex: '#1d2b26' }],
    details: { fit: 'Soft shoulder, slim lapel, two buttons.', madeToMeasure: 'Velvet chosen at your first visit.', delivery: 'Four weeks.' } },
  { category: 'statement', name: 'Animal-print shirts', tagline: 'The loud one, kept in the dark.',
    fabric: 'Printed viscose, camp collar. Leopard, zebra, snakeskin, tiger.', price: 6500,
    images: imgs('animal-print', 'Zebra-print camp-collar shirt on a hanger', true),
    colours: [{ name: 'Black leopard', hex: '#1b1b1b' }, { name: 'Zebra', hex: '#e8e2d6' }, { name: 'Purple snake', hex: '#5b2a78' }, { name: 'Red tiger', hex: '#9c1b1f' }],
    details: { fit: 'Relaxed, straight hem, worn open or buttoned.', madeToMeasure: 'Sleeve and body length to order.', delivery: 'One to two weeks.' } },
  { category: 'statement', name: 'Zebra Night', tagline: 'Ink and bone, after dark.',
    fabric: 'Camp-collar viscose crepe, zebra print in ink and bone.', price: 4990,
    images: imgs('zebra-night', 'Zebra Night camp-collar shirt in ink and bone on a hanger'),
    colours: [{ name: 'Ink and bone', hex: '#e8e2d6' }],
    details: { fit: 'Relaxed, boxy body, straight hem.', madeToMeasure: 'Sleeve and body length to order.', delivery: 'One to two weeks.' } },
  { category: 'shirts', name: 'The Consigliere', tagline: 'The quiet one who runs the room.',
    fabric: 'Two-ply Egyptian cotton poplin, cutaway collar, red hairline stripe.', price: 6490,
    images: imgs('consigliere', 'The Consigliere white poplin shirt with a red hairline stripe on a hanger'),
    colours: [{ name: 'White, red stripe', hex: '#f1ece6' }],
    details: { fit: 'Tailored body, cutaway collar, single-button cuff.', madeToMeasure: 'Collar, cuff and body to your measurements.', delivery: 'Two weeks.' } },
  { category: 'statement', name: 'Leopard Don', tagline: 'Spots you cannot change.',
    fabric: 'Rayon twill camp shirt, leopard rosette, mother-of-pearl buttons.', price: 5490,
    images: imgs('leopard-don', 'Leopard Don camp shirt with leopard rosettes on a hanger'),
    colours: [{ name: 'Leopard', hex: '#a2733b' }],
    details: { fit: 'Relaxed camp collar, worn open.', madeToMeasure: 'Sleeve and body length to order.', delivery: 'One to two weeks.' } },
  { category: 'shirts', name: 'Lilac Hour', tagline: 'Soft colour, firm collar.',
    fabric: 'Lilac cotton oxford, spread collar.', price: 3990,
    images: imgs('lilac-hour', 'Lilac Hour cotton oxford shirt with a spread collar on a hanger'),
    colours: [{ name: 'Lilac', hex: '#b7a3cf' }],
    details: { fit: 'Regular body, spread collar, button cuff.', madeToMeasure: 'Collar and sleeve to your measurements.', delivery: 'Two weeks.' } },
  { category: 'formal', name: 'Tuxedo', tagline: 'For the nights that matter.',
    fabric: 'Black barathea wool with satin peak lapels.', price: 110000,
    images: imgs('tuxedo', 'Black tuxedo with bow tie on a mannequin'),
    colours: [{ name: 'Black', hex: '#0f0d10' }, { name: 'Midnight', hex: '#1a1e2e' }],
    details: { fit: 'Single button, trim waist, braided trouser.', madeToMeasure: 'Three fittings. Studs and cufflinks on request.', delivery: 'Five to six weeks.' } },
  { category: 'formal', name: 'Double-breasted suit', tagline: 'Six buttons. Nothing to prove.',
    fabric: 'Charcoal chalk-stripe flannel, wide peak lapels, full canvas.', price: 92000,
    images: imgs('double-breasted', 'Charcoal chalk-stripe double-breasted suit on a mannequin'),
    colours: [{ name: 'Charcoal stripe', hex: '#3a3a3d' }, { name: 'Navy stripe', hex: '#1f2a3a' }],
    details: { fit: 'Structured shoulder, suppressed waist.', madeToMeasure: 'Pattern drafted for you and kept on file.', delivery: 'Five to seven weeks.' } },
  { category: 'formal', name: 'Camel overcoat', tagline: 'The first thing they see.',
    fabric: 'Pure camel hair, hand-set collar, horn buttons.', price: 98000,
    images: imgs('camel-overcoat', 'Knee-length camel overcoat on a mannequin'),
    colours: [{ name: 'Camel', hex: '#b0844f' }, { name: 'Charcoal', hex: '#4a4038' }],
    details: { fit: 'Knee length, room through the chest for tailoring underneath.', madeToMeasure: 'Length and sleeve set at your fitting.', delivery: 'Five to six weeks.' } },
  { category: 'wedding', name: 'Wedding bandhgala', tagline: 'The ceremony, tailored.',
    fabric: 'Ivory raw silk, brass buttons, gold-embroidered collar.', price: 120000,
    images: imgs('bandhgala', 'Ivory wedding bandhgala with gold embroidery on a mannequin'),
    colours: [{ name: 'Ivory gold', hex: '#e3d3b0' }, { name: 'Wine', hex: '#4a1d2e' }],
    details: { fit: 'Closed collar, long line, tapered trouser.', madeToMeasure: 'Embroidery planned with you. Three fittings.', delivery: 'Six to eight weeks.' } },
  { category: 'shirts', name: 'Shirt and tie set', tagline: 'The detail under everything.',
    fabric: 'Pale blue two-fold cotton, oxblood seven-fold silk tie.', price: 18000,
    images: imgs('shirt-tie', 'Pale blue shirt with oxblood silk tie'),
    colours: [{ name: 'Pale blue', hex: '#c9d4e3' }, { name: 'Oxblood tie', hex: '#6b1f26' }],
    details: { fit: 'Collar and cuff to your choice.', madeToMeasure: 'Pattern kept on file for repeat orders.', delivery: 'Two to three weeks.' } }
]

export const LOGO = `${base}brand/logo.webp`        // the real Godfather logo, black keyed out
export const LOGO_SMALL = `${base}brand/logo-small.webp`
/* crisp logo at every size: 1x/2x/3x sources, picked by the browser from the rendered width */
export const LOGO_SET = [160, 240, 320, 800].map(w => `${base}brand/logo-${w}.webp ${w}w`).concat(`${base}brand/logo.webp 1550w`).join(', ')
export const LOGO_GATE = `${base}brand/logo-800.webp`
export const STORE = (w: number) => `${base}store/store-${w > 900 ? 1920 : 1280}.webp`

/* Lorenzo's two ways in (Attire Collection first, as in the reference). */
export type Choice = { id: 'premium' | 'tour'; label: string; note: string }
export const CHOICES: Choice[] = [
  { id: 'tour', label: 'The Godfather Attire Collection', note: 'Suits · Shirts · Ties · Coats' },
  { id: 'premium', label: 'The Godfather Elite Wardrobe', note: 'Private room · By invitation' }
]
/* Filter chips on the attire tour */
export const CATEGORIES: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'formal', label: 'Suits and formal' },
  { id: 'shirts', label: 'Shirts' },
  { id: 'wedding', label: 'Wedding' },
  { id: 'statement', label: 'Statement pieces' }
]
export const HOST = { name: 'Lorenzo', role: 'Your host' }
/* time-of-day greeting (the user's "Good day, sir." in the afternoon) */
export function greeting(d = new Date()) {
  const h = d.getHours()
  const g = h >= 4 && h < 12 ? 'Good morning, sir.' : h >= 12 && h < 17 ? 'Good day, sir.' : 'Good evening, sir.'
  return `${g} Shall I show you The Godfather Attire Collection, or The Godfather Elite Wardrobe?`
}
export const TAILOR = {
  host: `${base}tailor/lorenzo.webp`,
  hostSet: `${base}tailor/lorenzo-436.webp 436w, ${base}tailor/lorenzo.webp 654w`,
  walk: `${base}walk/lorenzo-walk.webp`,
  curtain: `${base}tailor/curtain-tall.webp`
}

/* The live catalogue replaces ITEMS in place (premium first), so every module keeps the same array.
   The vault shows the premium pieces (the first vaultCount()), the Attire Collection shows them all. */
export const BUNDLED: Item[] = ITEMS.slice()
/* premium pieces first (they are sorted before attire). 0 means the premium wardrobe is out of stock. */
export const vaultCount = () => { const n = ITEMS.findIndex(it => it.collection === 'attire'); return n < 0 ? ITEMS.length : n }
/* Where the "Follow" link on an empty attire tour goes. [CLIENT TO CONFIRM]: the real profile URL is missing; change only this line. */
export const FOLLOW_URL = '#'
const listeners: (() => void)[] = []
export const onCatalogue = (f: () => void) => { listeners.push(f) }
export const catalogueChanged = () => listeners.forEach(f => f())
