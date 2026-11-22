p='src/App.tsx'; s=open(p).read()
s=s.replace("import { CONTACT, ITEMS, SAMPLE_PRICES, LOGO, LOGO_SMALL, type Item, type Choice } from './data'",
 "import { CONTACT, ITEMS, SAMPLE_PRICES, LOGO, LOGO_SMALL, STORE, TAILOR, type Item, type Choice } from './data'")
a="  /* ---------- keyboard ---------- */"
assert a in s
s=s.replace(a,"""  /* ---------- warm the cache for the next scenes while the gate is up ---------- */
  useEffect(() => {
    const pre = (u: string) => { const i = new Image(); i.decoding = 'async'; i.src = u; i.decode?.().catch(() => {}) }
    const t = window.setTimeout(() => {
      pre(STORE(Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(2, devicePixelRatio || 1)))
      pre(TAILOR.host); pre(TAILOR.curtain)
      ITEMS.slice(0, 2).forEach(it => pre(it.images[0].src))
    }, 500)
    return () => clearTimeout(t)
  }, [])

"""+a,1)
open(p,'w').write(s)
p='src/styles.css'; s=open(p).read()
s=s.replace("@keyframes flyIn{to{transform:scale(3.4);filter:blur(7px) brightness(1.6)}}","@keyframes flyIn{to{transform:scale(3.4);filter:blur(4px) brightness(1.5)}}")
open(p,'w').write(s); print('ok')
