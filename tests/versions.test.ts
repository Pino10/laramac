import { describe, expect, it } from 'vitest'
import {
  compareVersions,
  minorOf,
  mysqlUrls,
  parsePhpListing,
  phpDownloadUrl
} from '../src/main/versions'

describe('versions', () => {
  it('compares numerically, not alphabetically', () => {
    expect(compareVersions('8.4.10', '8.4.8')).toBeGreaterThan(0)
    expect(compareVersions('8.3.9', '8.4.0')).toBeLessThan(0)
    expect(compareVersions('8.4', '8.4.0')).toBe(0)
  })

  it('extracts the minor version', () => {
    expect(minorOf('8.4.12')).toBe('8.4')
  })

  it('picks the newest patch for each minor, needing both cli and fpm', () => {
    const names = [
      'php-8.4.8-cli-macos-aarch64.tar.gz',
      'php-8.4.8-fpm-macos-aarch64.tar.gz',
      'php-8.4.10-cli-macos-aarch64.tar.gz',
      'php-8.4.10-fpm-macos-aarch64.tar.gz',
      'php-8.5.1-cli-macos-aarch64.tar.gz', // no fpm: ignored
      'php-8.3.9-cli-macos-aarch64.tar.gz',
      'php-8.3.9-fpm-macos-aarch64.tar.gz',
      'php-8.3.9-fpm-macos-x86_64.tar.gz', // wrong arch: ignored
      'php-8.3.9-fpm-linux-aarch64.tar.gz', // wrong OS: ignored
      'README.txt'
    ].map((name) => ({ name }))
    expect(parsePhpListing(names, 'aarch64')).toEqual({ '8.4': '8.4.10', '8.3': '8.3.9' })
  })

  it('builds download URLs', () => {
    expect(phpDownloadUrl('fpm', '8.4.8', 'full', 'aarch64')).toBe(
      'https://dl.static-php.dev/static-php-cli/bulk/php-8.4.8-fpm-macos-aarch64.tar.gz'
    )
    expect(phpDownloadUrl('cli', '8.3.9', 'light', 'x86_64')).toContain('/common/php-8.3.9-cli-macos-x86_64')
  })

  it('builds MySQL URLs for both macOS tags', () => {
    const urls = mysqlUrls('8.4.9')
    expect(urls[0]).toContain('MySQL-8.4/mysql-8.4.9-macos15-')
    expect(urls[1]).toContain('macos14')
  })
})
