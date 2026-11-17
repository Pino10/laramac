/**
 * Before something is pasted into a server's terminal: is it a risky paste?
 * A paste that runs several lines at once, or one that can wipe things, is worth a second look,
 * because a terminal runs it the moment the line ends.
 */
const DANGEROUS: { re: RegExp; why: string }[] = [
  { re: /\brm\s+(-[a-z]*\s+)*(-[a-z]*[rR][a-z]*|--recursive)\b/, why: 'It deletes whole folders and everything inside them.' },
  { re: /\bfind\b[^\n]*\s-delete\b/i, why: 'It deletes every file it finds.' },
  { re: /\b(mkfs|fdisk|wipefs)\b/i, why: 'It can erase a disk.' },
  { re: /\bdd\s+[^\n]*\bof=\/dev\//i, why: 'It writes straight over a disk.' },
  { re: />\s*\/dev\/(sd|nvme|vd)/i, why: 'It writes straight over a disk.' },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: 'It is a fork bomb that freezes the server.' },
  { re: /\bchmod\s+(-R\s+)?[0-7]*777\s+\//i, why: 'It lets everyone change everything.' },
  { re: /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i, why: 'It runs a script from the internet without you reading it.' },
  { re: /\bdrop\s+(database|table)\b/i, why: 'It deletes a database or a table.' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: 'It switches the server off or restarts it.' }
]

export interface PasteRisk {
  /** A short, plain reason to stop and look. */
  reason: string
  lines: number
}

export function pasteRisk(text: string): PasteRisk | null {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '').length
  for (const d of DANGEROUS) if (d.re.test(text)) return { reason: d.why, lines }
  if (lines > 1 && /[\r\n]/.test(text.replace(/[\r\n]+$/, ''))) return { reason: `It has ${lines} lines, and a terminal runs each one as soon as it is pasted.`, lines }
  return null
}
