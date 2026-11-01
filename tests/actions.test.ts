import { describe, expect, it } from 'vitest'
import { parseActions } from '../src/shared/actions'

const block = (json: string): string => '```laramac-action\n' + json + '\n```'

describe('assistant actions', () => {
  it('extracts valid actions and strips the blocks from the text', () => {
    const text = `I will install it.\n${block('{"action":"install-php","version":"8.3"}')}\nThen start nginx.\n${block('{"action":"start-service","id":"nginx"}')}`
    const { prose, actions } = parseActions(text)
    expect(actions).toEqual([
      { action: 'install-php', version: '8.3' },
      { action: 'start-service', id: 'nginx' }
    ])
    expect(prose).toContain('I will install it.')
    expect(prose).not.toContain('laramac-action')
  })

  it('drops unknown actions, bad values and malformed JSON', () => {
    const text = [
      block('{"action":"run-shell","cmd":"rm -rf ~"}'),
      block('{"action":"install-php","version":"8.3; rm -rf /"}'),
      block('{"action":"start-service","id":"sshd"}'),
      block('{"action":"create-project","kind":"drupal","name":"x"}'),
      block('{not json'),
      block('{"action":"open-site","site":"blog"}')
    ].join('\n')
    expect(parseActions(text).actions).toEqual([{ action: 'open-site', site: 'blog' }])
  })

  it('leaves normal replies alone', () => {
    expect(parseActions('Just text.')).toEqual({ prose: 'Just text.', actions: [] })
  })
})
