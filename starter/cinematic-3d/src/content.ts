/* ALL the content lives here. Replace the placeholders with your real pieces: the 3D scene and the page read this array and nothing else.
   image = a transparent cut-out (PNG/WebP, 3:4, subject standing on the bottom edge). The scene re-frames each cut-out to the arch automatically,
   so the subject can be any size and anywhere in the image. See ASSET-PROMPTS.md for how to generate them. Never invent facts: use [PLACEHOLDER]. */
export type Piece = { name: string; tagline: string; description: string; price?: number; image: string; specs: [string, string][] }
const base = import.meta.env.BASE_URL
export const PIECES: Piece[] = [
  { name: 'Piece one', tagline: '[PLACEHOLDER tagline]', description: '[PLACEHOLDER: two short lines about the piece. Material, make, why it matters.]', price: 4900, image: `${base}placeholders/piece-1.png`,
    specs: [['Fit', '[PLACEHOLDER]'], ['Made in', '[PLACEHOLDER]'], ['Delivery', '[PLACEHOLDER]']] },
  { name: 'Piece two', tagline: '[PLACEHOLDER tagline]', description: '[PLACEHOLDER: two short lines about the piece.]', price: 6900, image: `${base}placeholders/piece-2.png`,
    specs: [['Fit', '[PLACEHOLDER]'], ['Made in', '[PLACEHOLDER]'], ['Delivery', '[PLACEHOLDER]']] },
  { name: 'Piece three', tagline: '[PLACEHOLDER tagline]', description: '[PLACEHOLDER: two short lines about the piece.]', price: 8900, image: `${base}placeholders/piece-3.png`,
    specs: [['Fit', '[PLACEHOLDER]'], ['Made in', '[PLACEHOLDER]'], ['Delivery', '[PLACEHOLDER]']] },
  { name: 'Piece four', tagline: '[PLACEHOLDER tagline]', description: '[PLACEHOLDER: two short lines about the piece.]', price: 12900, image: `${base}placeholders/piece-4.png`,
    specs: [['Fit', '[PLACEHOLDER]'], ['Made in', '[PLACEHOLDER]'], ['Delivery', '[PLACEHOLDER]']] }
]
export const BRAND = { name: '[BRAND]', accent: '#f2c46b' }
