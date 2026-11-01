import { execFileSync, spawn, spawnSync, type ChildProcess } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  DumpFilter,
  extractTar,
  extractZip,
  findSiteUrl,
  importSql,
  inspect,
  rewriteWpConfig,
  runImport,
  scan
} from '../src/main/importer'
import * as dbadmin from '../src/main/dbadmin'
import * as snapshots from '../src/main/snapshots'
import { waitForPort } from '../src/main/process'
import { freshEnv } from './helpers'

const tmp = (p: string): string => mkdtempSync(join(tmpdir(), p))

/** Python builds archives with hostile entries that normal tools refuse to create. */
function py(script: string): void {
  execFileSync('python3', ['-c', script])
}

const WP_CONFIG = `<?php
define( 'DB_NAME', 'oldsite_db' );
define( 'DB_USER', 'admin' );
define( 'DB_PASSWORD', 'secret' );
define( 'DB_HOST', 'localhost' );
/* That's all, stop editing! Happy publishing. */
require_once ABSPATH . 'wp-settings.php';
`

describe('safe extraction', () => {
  it('extracts normal tar.gz files and leaves links out', async () => {
    const dir = tmp('lm-tar-')
    const src = join(dir, 'src')
    mkdirSync(join(src, 'site'), { recursive: true })
    writeFileSync(join(src, 'site', 'index.php'), '<?php echo 1;')
    execFileSync('ln', ['-s', '/etc/passwd', join(src, 'site', 'passwd')])
    execFileSync('tar', ['-czf', join(dir, 'a.tar.gz'), '-C', src, 'site'])
    const out = join(dir, 'out')
    const stats = await extractTar(join(dir, 'a.tar.gz'), out)
    expect(existsSync(join(out, 'site', 'index.php'))).toBe(true)
    expect(existsSync(join(out, 'site', 'passwd'))).toBe(false)
    expect(stats.skippedLinks).toBe(1)
  })

  it('refuses tar entries that climb out of the folder', async () => {
    const dir = tmp('lm-tarevil-')
    const archive = join(dir, 'evil.tar.gz')
    py(`
import tarfile, io
t = tarfile.open(${JSON.stringify(archive)}, 'w:gz')
data = b'pwned'
info = tarfile.TarInfo('../escaped.txt'); info.size = len(data); t.addfile(info, io.BytesIO(data))
t.close()`)
    const out = join(dir, 'out')
    await expect(extractTar(archive, out)).rejects.toThrow()
    expect(existsSync(join(dir, 'escaped.txt'))).toBe(false)
  })

  it('refuses zip slip and skips zip symlinks', async () => {
    const dir = tmp('lm-zipevil-')
    const slip = join(dir, 'slip.zip')
    py(`
import zipfile
z = zipfile.ZipFile(${JSON.stringify(slip)}, 'w')
z.writestr('ok/index.php', '<?php')
z.writestr('../../escaped.txt', 'pwned')
z.close()`)
    await expect(extractZip(slip, join(dir, 'out'))).rejects.toThrow()
    expect(existsSync(join(dir, '..', 'escaped.txt'))).toBe(false)

    const links = join(dir, 'links.zip')
    py(`
import zipfile
z = zipfile.ZipFile(${JSON.stringify(links)}, 'w')
z.writestr('site/index.php', '<?php')
info = zipfile.ZipInfo('site/link')
info.external_attr = (0o120777 << 16)
z.writestr(info, '/etc/passwd')
z.close()`)
    const out = join(dir, 'out2')
    const stats = await extractZip(links, out)
    expect(existsSync(join(out, 'site', 'index.php'))).toBe(true)
    expect(existsSync(join(out, 'site', 'link'))).toBe(false)
    expect(stats.skippedLinks).toBe(1)
  })
})

describe('detection', () => {
  it('finds a Laragon-style project and its dump', () => {
    const root = tmp('lm-scan-')
    mkdirSync(join(root, 'www', 'mysite', 'wp-content'), { recursive: true })
    writeFileSync(join(root, 'www', 'mysite', 'wp-config.php'), WP_CONFIG)
    writeFileSync(join(root, 'www', 'mysite', 'index.php'), '')
    mkdirSync(join(root, 'www', 'mysite', 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(root, 'www', 'mysite', 'node_modules', 'x', 'fixture.sql'), 'ignored')
    writeFileSync(join(root, 'mysite.sql'), 'CREATE TABLE t (id int);')
    const found = scan(root)
    expect(found.projectDir).toBe(join('www', 'mysite'))
    expect(found.sqlFiles.map((f) => f.path)).toEqual(['mysite.sql'])
  })

  it('reads the old WordPress address from a dump', () => {
    expect(findSiteUrl("INSERT INTO `wp_options` VALUES (1,'siteurl','http://mysite.test/','yes'),(2,'home','http://mysite.test','yes');")).toBe('http://mysite.test')
  })

  it('builds an import plan from a zip, without touching www', async () => {
    const { www } = freshEnv()
    const src = tmp('lm-plan-')
    mkdirSync(join(src, 'mysite'))
    writeFileSync(join(src, 'mysite', 'wp-config.php'), WP_CONFIG)
    writeFileSync(join(src, 'mysite', 'index.php'), '')
    writeFileSync(join(src, 'dump.sql'), "INSERT INTO wp_options VALUES (1,'siteurl','https://old.example.com','yes');")
    const zip = join(src, 'export.zip')
    execFileSync('python3', ['-c', `
import zipfile, os
z = zipfile.ZipFile(${JSON.stringify(zip)}, 'w')
for p in ['mysite/wp-config.php', 'mysite/index.php', 'dump.sql']:
    z.write(os.path.join(${JSON.stringify(src)}, p), p)
z.close()`])
    const plan = await inspect(zip, ['mariadb'])
    expect(plan.hasProject).toBe(true)
    expect(plan.suggestedName).toBe('mysite')
    expect(plan.kind).toBe('wordpress')
    expect(plan.suggestedDb).toBe('oldsite_db')
    expect(plan.configFile).toBe('wp-config.php')
    expect(plan.sqlFiles[0].path).toBe('dump.sql')
    expect(plan.oldUrl).toBe('https://old.example.com')
    expect(existsSync(join(www, 'mysite'))).toBe(false)
  })
})

async function filter(text: string): Promise<{ out: string; skipped: number }> {
  const f = new DumpFilter()
  let out = ''
  await new Promise<void>((resolve, reject) => {
    Readable.from([Buffer.from(text)]).pipe(f).on('data', (d: Buffer) => (out += d.toString())).on('end', resolve).on('error', reject)
  })
  return { out, skipped: f.skipped }
}

describe('dump filter', () => {
  it('passes normal SQL, including DELIMITER blocks', async () => {
    const sql = 'CREATE TABLE a (id int);\nDELIMITER ;;\nCREATE TRIGGER t BEFORE INSERT ON a FOR EACH ROW SET NEW.id = 1;;\nDELIMITER ;\n'
    expect((await filter(sql)).out).toBe(sql)
  })

  it.each(['\\! touch /tmp/pwned', 'system rm -rf ~', 'source /etc/passwd', '\\. /etc/passwd', '\\T /tmp/out', 'tee /tmp/out', 'pager sh', '  \\P sh'])(
    'refuses the client command %s',
    async (line) => {
      await expect(filter(`CREATE TABLE a (id int);\n${line}\n`)).rejects.toThrow(/client command/)
    }
  )

  it('accepts columns and values named like client commands', async () => {
    const sql = [
      'CREATE TABLE `plays` (',
      '  id int NOT NULL,',
      '  source VARCHAR(10) NOT NULL,',
      '  system varchar(20) DEFAULT NULL,',
      '  tee int,',
      '  pager int',
      ') ENGINE=InnoDB;',
      "INSERT INTO plays VALUES (1,'source','C:\\\\laragon\\\\www','it\\'s \\\\! fine');",
      '/*!40101 SET NAMES utf8mb4 */;',
      '-- source /etc/passwd in a comment',
      '/* \\! inside a comment */',
      ''
    ].join('\r\n')
    expect((await filter(sql)).out).toBe(sql)
  })

  it('refuses a backslash command in the middle of a line', async () => {
    await expect(filter("INSERT INTO a VALUES (1); \\! touch /tmp/pwned\n")).rejects.toThrow(/client command/)
  })

  it('refuses a client command that starts a new statement after a multi-line one', async () => {
    await expect(filter('CREATE TABLE a (\n  id int\n);\nsource /etc/passwd\n')).rejects.toThrow(/client command/)
  })

  it('drops a USE that follows another statement on the same line', async () => {
    const r = await filter('CREATE TABLE a (id int); USE other;\nINSERT INTO a VALUES (1);\n')
    expect(r.out).not.toMatch(/USE/)
    expect(r.out).toContain('INSERT INTO a')
  })

  it('drops statements that switch databases or change users', async () => {
    const r = await filter("CREATE DATABASE `other`;\nUSE `other`;\nDROP DATABASE prod;\nGRANT ALL ON *.* TO 'x'@'%';\nCREATE USER 'x';\nCREATE TABLE ok (id int);\n")
    expect(r.out).toContain('CREATE TABLE ok')
    expect(r.out).not.toMatch(/USE|GRANT|DROP DATABASE|CREATE DATABASE|CREATE USER/)
    expect(r.skipped).toBe(5)
  })
})

describe('wp-config rewrite', () => {
  it('points WordPress at the local database and the new address', () => {
    const out = rewriteWpConfig(WP_CONFIG, 'mysite', '127.0.0.1:3307', 'http://mysite.test')
    expect(out).toContain("define( 'DB_NAME', 'mysite' )")
    expect(out).toContain("define( 'DB_USER', 'root' )")
    expect(out).toContain("define( 'DB_PASSWORD', '' )")
    expect(out).toContain("define( 'DB_HOST', '127.0.0.1:3307' )")
    expect(out.indexOf("WP_HOME', 'http://mysite.test'")).toBeLessThan(out.indexOf("That's all"))
  })
})

// ------------------------------------------------------------------ Real MariaDB

const MARIADBD = spawnSync('which', ['mariadbd']).status === 0
const CLIENT = '/usr/bin/mariadb'

describe.skipIf(!MARIADBD || process.platform !== 'linux')('real import into MariaDB', () => {
  let server: ChildProcess
  const data = tmp('lm-maria-')
  const sock = join(data, 'm.sock')
  const q = (sql: string): string =>
    execFileSync(CLIENT, ['--host=127.0.0.1', '--port=3307', '--user=root', '-N', '-e', sql]).toString().trim()

  beforeAll(async () => {
    rmSync(data, { recursive: true, force: true })
    mkdirSync(data)
    execFileSync('mariadb-install-db', ['--user=root', `--datadir=${data}/db`, '--auth-root-authentication-method=normal', '--skip-test-db'], { stdio: 'ignore' })
    server = spawn('mariadbd', ['--no-defaults', '--user=root', `--datadir=${data}/db`, '--port=3307', '--bind-address=127.0.0.1', `--socket=${sock}`, '--skip-name-resolve'], { stdio: 'ignore' })
    expect(await waitForPort(3307, 30000)).toBe(true)
  })

  afterAll(() => {
    server?.kill('SIGTERM')
  })

  it('imports a dump into the chosen database, ignoring its USE and CREATE DATABASE', async () => {
    const dump = join(data, 'dump.sql')
    writeFileSync(
      dump,
      [
        'CREATE DATABASE IF NOT EXISTS `somewhere_else`;',
        'USE `somewhere_else`;',
        'CREATE TABLE products (id int primary key, name varchar(50));',
        "INSERT INTO products VALUES (1,'Mug'),(2,'Shirt'),(3,'Cap');",
        'DELIMITER ;;',
        'CREATE TRIGGER up BEFORE INSERT ON products FOR EACH ROW SET NEW.name = UPPER(NEW.name);;',
        'DELIMITER ;',
        ''
      ].join('\n')
    )
    const skipped = await importSql(dump, { client: CLIENT, engine: 'mariadb', port: 3307, database: 'shop' })
    expect(skipped).toBe(2)
    expect(q('SELECT COUNT(*) FROM shop.products')).toBe('3')
    expect(q("SHOW DATABASES LIKE 'somewhere_else'")).toBe('')
    expect(q('SHOW TRIGGERS FROM shop').length).toBeGreaterThan(0)
  })

  it('imports a HeidiSQL or phpMyAdmin style dump with a column called source', async () => {
    const dump = join(data, 'radio.sql')
    writeFileSync(
      dump,
      [
        '-- HeidiSQL dump',
        '/*!40101 SET NAMES utf8 */;',
        '/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;',
        'CREATE DATABASE IF NOT EXISTS `imperial_radio` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;',
        'USE `imperial_radio`;',
        'CREATE TABLE IF NOT EXISTS `plays` (',
        '  `id` int(11) NOT NULL AUTO_INCREMENT,',
        '  source VARCHAR(10) NOT NULL,',
        '  `title` varchar(100) DEFAULT NULL,',
        '  PRIMARY KEY (`id`)',
        ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
        'INSERT INTO `plays` (`id`, source, `title`) VALUES',
        "\t(1, 'live', 'Morning -- show'),",
        "\t(2, 'tee', 'It\\'s #1'),",
        "\t(3, 'source', 'C:\\\\laragon\\\\www');",
        '/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;',
        ''
      ].join('\r\n')
    )
    await importSql(dump, { client: CLIENT, engine: 'mariadb', port: 3307, database: 'radio' })
    expect(q('SELECT COUNT(*) FROM radio.plays')).toBe('3')
    expect(q('SELECT title FROM radio.plays WHERE id = 2')).toBe("It's #1")
    expect(q('SELECT title FROM radio.plays WHERE id = 3')).toBe('C:\\\\laragon\\\\www')
  })

  it('removes a new database again when its import fails', async () => {
    const dump = join(data, 'broken.sql')
    writeFileSync(dump, 'CREATE TABLE ok (id int);\nINSERT INTO missing_table VALUES (1);\n')
    await expect(importSql(dump, { client: CLIENT, engine: 'mariadb', port: 3307, database: 'broken_db' })).rejects.toThrow()
    expect(q("SHOW DATABASES LIKE 'broken_db'")).toBe('')
  })

  it('lists, creates, backs up, restores and deletes databases', async () => {
    const t = { engine: 'mariadb' as const, client: CLIENT, port: 3307 }
    await dbadmin.createDatabase(t, 'notes_app')
    q('CREATE TABLE notes_app.notes (id int primary key, body text); INSERT INTO notes_app.notes VALUES (1,"a"),(2,"b");')
    const list = await dbadmin.listDatabases(t)
    const notes = list.find((d) => d.name === 'notes_app')
    expect(notes).toMatchObject({ engine: 'mariadb', tables: 1 })
    expect(list.some((d) => d.name === 'mysql' || d.name === 'information_schema')).toBe(false)

    const backup = join(data, 'notes.sql.gz')
    await dbadmin.exportDatabase(t, 'notes_app', backup)
    expect(statSync(backup).size).toBeGreaterThan(100)

    await dbadmin.dropDatabase(t, 'notes_app')
    expect(q("SHOW DATABASES LIKE 'notes_app'")).toBe('')
    await importSql(backup, { client: CLIENT, engine: 'mariadb', port: 3307, database: 'notes_restored' })
    expect(q('SELECT COUNT(*) FROM notes_restored.notes')).toBe('2')

    await expect(dbadmin.createDatabase(t, 'bad`name')).rejects.toThrow(/letters, numbers/)
    await expect(dbadmin.dropDatabase(t, 'mysql')).rejects.toThrow(/belongs to the database server/)
  })

  it('snapshots a site with its database and restores both', async () => {
    const t = { engine: 'mariadb' as const, client: CLIENT, port: 3307 }
    const deps = { target: () => t }
    freshEnv()
    const site = join(data, 'www', 'shop')
    mkdirSync(join(site, 'node_modules'), { recursive: true })
    writeFileSync(join(site, 'wp-config.php'), "<?php define( 'DB_NAME', 'snap_wp' ); define( 'DB_HOST', '127.0.0.1:3307' );")
    writeFileSync(join(site, 'index.php'), 'version one')
    writeFileSync(join(site, 'node_modules', 'big.js'), 'x')
    q('CREATE DATABASE snap_wp; CREATE TABLE snap_wp.posts (id int, title text); INSERT INTO snap_wp.posts VALUES (1,"Hello");')

    expect(snapshots.detectSiteDatabase(site)).toEqual({ engine: 'mariadb', name: 'snap_wp' })
    const snap = await snapshots.createSnapshot(site, 'Working checkout', deps)
    expect(snap.database).toEqual({ engine: 'mariadb', name: 'snap_wp' })
    expect(snapshots.listSnapshots(site).map((x) => x.note)).toEqual(['Working checkout'])

    writeFileSync(join(site, 'index.php'), 'broken')
    writeFileSync(join(site, 'new.php'), 'added later')
    q('DELETE FROM snap_wp.posts; INSERT INTO snap_wp.posts VALUES (2,"Oops");')

    await snapshots.restoreSnapshot(site, snap.id, deps)
    expect(readFileSync(join(site, 'index.php'), 'utf8')).toBe('version one')
    expect(existsSync(join(site, 'new.php'))).toBe(false)
    expect(existsSync(join(site, 'node_modules'))).toBe(false)
    expect(q('SELECT title FROM snap_wp.posts')).toBe('Hello')
    // The state just before the restore was kept, so the restore can be undone.
    expect(snapshots.listSnapshots(site)).toHaveLength(2)
    expect(snapshots.listSnapshots(site)[0].note).toMatch(/^Before restoring/)

    const out = join(data, 'export.tar.gz')
    snapshots.exportSnapshot(site, snap.id, out)
    const plan = await inspect(out, ['mariadb'])
    expect(plan.sqlFiles[0].path).toMatch(/shop\.sql\.gz$/)

    snapshots.deleteSnapshot(site, snap.id)
    expect(snapshots.listSnapshots(site)).toHaveLength(1)
    expect(() => snapshots.deleteSnapshot(site, '../../x')).toThrow()
  })

  it('handles gzipped dumps', async () => {
    const dump = join(data, 'g.sql')
    writeFileSync(dump, 'CREATE TABLE t (id int);\nINSERT INTO t VALUES (7);\n')
    execFileSync('gzip', ['-f', dump])
    await importSql(`${dump}.gz`, { client: CLIENT, engine: 'mariadb', port: 3307, database: 'gz_db' })
    expect(q('SELECT id FROM gz_db.t')).toBe('7')
  })

  it('never runs shell commands hidden in a dump', async () => {
    const marker = join(data, 'pwned')
    const dump = join(data, 'evil.sql')
    writeFileSync(dump, `CREATE TABLE t (id int);\n\\! touch ${marker}\n`)
    await expect(importSql(dump, { client: CLIENT, engine: 'mariadb', port: 3307, database: 'evil_db' })).rejects.toThrow()
    expect(existsSync(marker)).toBe(false)
  })

  it('the client sandbox blocks shell commands even without the filter', () => {
    const marker = join(data, 'pwned2')
    const res = spawnSync(CLIENT, ['--host=127.0.0.1', '--port=3307', '--user=root', '--sandbox', '--local-infile=0'], {
      input: `\\! touch ${marker}\n`,
      encoding: 'utf8'
    })
    expect(res.status).not.toBe(0)
    expect(existsSync(marker)).toBe(false)
  })

  it('imports a whole WordPress export end to end', async () => {
    const { www } = freshEnv()
    const src = tmp('lm-e2e-')
    mkdirSync(join(src, 'www', 'shop'), { recursive: true })
    writeFileSync(join(src, 'www', 'shop', 'wp-config.php'), WP_CONFIG)
    writeFileSync(join(src, 'www', 'shop', 'index.php'), '<?php')
    writeFileSync(join(src, 'shop.sql'), "CREATE TABLE wp_options (option_id int, option_name varchar(64), option_value text, autoload varchar(3));\nINSERT INTO wp_options VALUES (1,'siteurl','http://shop.local','yes');\n")
    const archive = join(src, 'shop.tar.gz')
    execFileSync('tar', ['-czf', archive, '-C', src, 'www', 'shop.sql'])

    const plan = await inspect(archive, ['mariadb'])
    const result = await runImport(
      plan.id,
      { name: plan.suggestedName, sqlFile: plan.sqlFiles[0].path, engine: 'mariadb', database: 'shop_local', updateConfig: true, replaceUrl: true, composerInstall: false },
      { update: () => undefined, ensureRunning: async () => undefined, clientFor: () => CLIENT, composerInstall: async () => undefined }
    )
    expect(result.site).toBe('shop')
    expect(q("SELECT option_value FROM shop_local.wp_options WHERE option_name='siteurl'")).toBe('http://shop.local')
    const cfg = readFileSync(join(www, 'shop', 'wp-config.php'), 'utf8')
    expect(cfg).toContain("'DB_NAME', 'shop_local'")
    expect(cfg).toContain("'DB_HOST', '127.0.0.1:3307'")
    expect(cfg).toContain("'WP_HOME', 'http://shop.test'")
  })
})
