p='App.tsx'; s=open(p).read()
a="""                <div className="copy">
                  <h2 className="name line\""""
assert a in s
s=s.replace(a,"""                <div className="copy">
                  <p className="kicker" aria-hidden="true">{pad(i + 1)} <span>/ {pad(N)}</span></p>
                  <h2 className="name line\"""",1)
i=s.index('id="home"'); j=s.index('</button>',i)+len('</button>')
s=s[:j]+"""
            {view === 'wardrobe' && <button className="back-shop" id="back-shop" type="button" onClick={callTailor}>
              <svg viewBox="0 0 12 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 2 2 10l8 8" /></svg>Back to the shop</button>}
            {view === 'wardrobe' && <p className="vault-label" aria-hidden="true">Private wardrobe · {pad(Math.min(N, Math.max(1, index + 1)))}</p>}"""+s[j:]
open(p,'w').write(s)
p='styles.css'; s=open(p).read()
s+=r"""
/* ---------- vault chrome (after the reference) ---------- */
.name,.grid-head h1,#sheet-title,.card-name{font-family:var(--slab);font-weight:400;letter-spacing:0}
.name{font-size:clamp(1.9rem,8.4vw,3.9rem);line-height:1.02}
.kicker{margin:0 0 6px;font-variant-numeric:tabular-nums;font-size:.74rem;letter-spacing:.18em;color:var(--neon)}
.kicker span{color:var(--muted)}
.vault-label{display:none}
@media (min-width:960px){
  .vault .back-shop{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;background:none;border:0;color:var(--bone);cursor:pointer;font-size:.8rem;letter-spacing:.08em;margin-right:auto}
  .vault .back-shop svg{width:8px;height:14px}
  .vault .back-shop:hover{color:#f2c46b}
  .vault-label{display:block;position:absolute;left:50%;top:30px;transform:translateX(-50%);margin:0;font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;color:#f2c46b}
  .name{font-size:clamp(2.6rem,3.9vw,4.4rem)}
}
.vault .kicker{color:#f2c46b}
"""
open(p,'w').write(s)
print('ok')
