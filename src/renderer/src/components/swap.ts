import type { SwapChoice } from '@shared/types'

/** The question after an update installed a newer version next to the one in use. */
export function swapQuestion(w: SwapChoice): { title: string; label: string; confirm: string; cancel: string } {
  const php = w.name === 'PHP'
  const name = php ? `PHP ${w.to}` : `${w.name} ${w.to}`
  const old = php ? `PHP ${w.from}` : `${w.name} ${w.from}`
  return {
    title: `Use ${name} now?`,
    label: php
      ? `${name} is installed next to ${old}. If you switch, new sites and the terminal use ${w.to}. Sites that choose their own PHP version keep it. You can switch back any time.`
      : w.sameData
        ? `${name} is installed next to ${old}. Both use the same data, so your databases stay as they are, and you can switch back any time. If it is running, it restarts for a moment.`
        : `${name} keeps its own data folder, which starts empty. Your databases in ${old} are not deleted, and they are back when you switch to ${old} again. If it is running, it restarts for a moment.`,
    confirm: `Use ${w.to}`,
    cancel: `Keep ${w.from}`
  }
}

type Ask = (o: { title: string; label?: string; confirm?: string; cancel?: string; yesNo?: boolean }) => Promise<string | null>

/** Asks about each newer version and switches the ones the person accepts. Returns how many were switched. */
export async function offerSwaps(swaps: SwapChoice[] | undefined, ask: Ask, use: (id: string) => Promise<unknown>): Promise<number> {
  let n = 0
  for (const w of swaps ?? []) {
    const q = swapQuestion(w)
    if ((await ask({ ...q, yesNo: true })) !== 'yes') continue
    await use(w.id)
    n++
  }
  return n
}
