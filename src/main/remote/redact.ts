/**
 * Takes secrets out of text before it is saved in a log or handed to Claude:
 * private keys, passwords in command lines, tokens, cloud keys and sign-in headers.
 */
const RULES: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[private key removed]'],
  [/\b(authorization|proxy-authorization)\s*[:=]\s*(bearer|basic|token)?\s*[A-Za-z0-9._~+/=-]{8,}/gi, '$1: [removed]'],
  [/\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[A-Za-z0-9_.-]*)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s"',;]+)/gi, '$1=[removed]'],
  [/(--?(?:password|pass|p)\s*[= ]\s*)("[^"\n]*"|'[^'\n]*'|[^\s]+)/gi, '$1[removed]'],
  [/(\s-p)(?!ort\b)([^\s-][^\s]*)/g, '$1[removed]'],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/g, '[token removed]'],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, '[token removed]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[key removed]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[token removed]'],
  [/\b(mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|ftp|ftps|sftp):\/\/([^:@\s/]+):([^@\s/]+)@/gi, '$1://$2:[removed]@'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[token removed]']
]

export function redact(text: string): string {
  let out = text
  for (const [re, to] of RULES) out = out.replace(re, to)
  return out
}
