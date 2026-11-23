import type { ReactNode } from 'react'

/* The word "Elite" always shows in sharp, sparkling gold; the rest of the text is untouched. */
export function Elite({ children = 'Elite' }: { children?: ReactNode }) {
  return <span className="elite">{children}</span>
}
export function withElite(text: string): ReactNode {
  return text.split(/(Elite)/).map((part, i) => part === 'Elite' ? <Elite key={i} /> : part)
}
