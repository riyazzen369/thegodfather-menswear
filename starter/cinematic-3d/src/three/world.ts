/* World units <-> screen. One function decides how big a piece is and where it sits on screen, for every layout.
   The camera looks straight down -z from distance D at the piece plane (z = 0). A piece is 3:4 and fills about half the screen height. */
import { rig } from '../rig'
export const FOV = 40, D = 6
const TAN = Math.tan((FOV / 2) * Math.PI / 180)
export function world() {
  const { W, H } = rig.layout, visH = 2 * D * TAN, visW = visH * (W / H), portrait = H >= W * 1.05
  const pieceH = visH * (portrait ? 0.5 : 0.7), pieceW = pieceH * 0.75
  /* where the focused piece appears on screen, as a fraction of the screen (ax: right of centre, ay: above centre).
     Portrait: the piece is in the top part, the text panel under it. Wide: the piece on the left, the text on the right. */
  const ax = portrait ? 0 : -0.22, ay = portrait ? 0.17 : 0.02
  return { visH, visW, pieceH, pieceW, spacing: pieceW * 1.15, camDx: -ax * visW, camDy: -ay * visH, portrait }
}
