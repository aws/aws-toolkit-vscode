/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import { meetsMinimum, resolveCdkCli } from '../../../../awsService/cdk/lsp/cdkCliResolver'
import { TestFolder } from '../../../testUtil'

/** File name the resolver looks for on this platform (npm-style `.cmd` launchers on Windows). */
function exe(name: string): string {
    return process.platform === 'win32' ? `${name}.cmd` : name
}

describe('resolveCdkCli', function () {
    let root: TestFolder
    let appDir: string
    /** An isolated PATH, so the developer's own `cdk`/`node` never leak into results. */
    let binDir: TestFolder
    let env: NodeJS.ProcessEnv

    beforeEach(async function () {
        root = await TestFolder.create()
        appDir = await root.mkdir('packages/app')
        binDir = await TestFolder.create()
        env = { PATH: ['', binDir.path].join(path.delimiter) } // empty entry must be skipped
    })

    async function writeAwsCdkPackage(pkg: object): Promise<void> {
        await root.write('node_modules/aws-cdk/package.json', JSON.stringify(pkg))
    }

    it('uses the cliPath setting when it exists, ahead of a local install', async function () {
        const configured = await binDir.write('my-cdk')
        await root.write(path.join('node_modules', '.bin', exe('cdk')))

        assert.deepStrictEqual(await resolveCdkCli(appDir, env, configured), {
            command: configured,
            args: ['lsp'],
            source: 'setting',
        })
    })

    it('finds nothing when the cliPath setting is missing, rather than silently using another CLI', async function () {
        await root.write(path.join('node_modules', '.bin', exe('cdk')))

        assert.strictEqual(await resolveCdkCli(appDir, env, path.join(binDir.path, 'nope')), undefined)
    })

    it('prefers a hoisted node_modules/.bin/cdk, with the version of the aws-cdk next to it', async function () {
        const bin = await root.write(path.join('node_modules', '.bin', exe('cdk')))
        await writeAwsCdkPackage({ version: '2.1140.0', bin: 'bin/cdk' })

        assert.deepStrictEqual(await resolveCdkCli(appDir, env, undefined), {
            command: bin,
            args: ['lsp'],
            source: 'nodeModules',
            version: '2.1140.0',
        })
    })

    it('uses node_modules/.bin/cdk with an unknown version when aws-cdk/package.json is unreadable', async function () {
        const bin = await root.write(path.join('node_modules', '.bin', exe('cdk')))

        const resolved = await resolveCdkCli(appDir, env, undefined)

        assert.strictEqual(resolved?.command, bin)
        assert.strictEqual(resolved.version, undefined)
    })

    for (const bin of [{ cdk: 'bin/cdk' }, 'bin/cdk']) {
        it(`without a .bin link, runs aws-cdk's bin script (${JSON.stringify(bin)}) with node from PATH`, async function () {
            await writeAwsCdkPackage({ version: '2.1140.0', bin })
            const node = await binDir.write(exe('node'))

            const resolved = await resolveCdkCli(appDir, env, undefined)

            assert.strictEqual(resolved?.source, 'nodeModules')
            assert.strictEqual(resolved.command, node)
            assert.strictEqual(resolved.version, '2.1140.0')
            // Node's resolver returns the real path, so only the suffix is stable.
            assert.ok(resolved.args[0].endsWith(path.join('node_modules', 'aws-cdk', 'bin', 'cdk')), resolved.args[0])
            assert.strictEqual(resolved.args[1], 'lsp')
        })
    }

    it('falls back to cdk on PATH when aws-cdk is installed but node is not on PATH', async function () {
        await writeAwsCdkPackage({ version: '2.1140.0', bin: { cdk: 'bin/cdk' } })
        const cdk = await binDir.write(exe('cdk'))

        assert.deepStrictEqual(await resolveCdkCli(appDir, env, undefined), {
            command: cdk,
            args: ['lsp'],
            source: 'path',
        })
    })

    it('falls back to cdk on PATH when the aws-cdk package declares no cdk bin', async function () {
        await writeAwsCdkPackage({ version: '2.1140.0', bin: { other: 'bin/other' } })
        await binDir.write(exe('node'))
        const cdk = await binDir.write(exe('cdk'))

        assert.strictEqual((await resolveCdkCli(appDir, env, undefined))?.command, cdk)
    })

    it('finds nothing when there is no CDK CLI anywhere', async function () {
        assert.strictEqual(await resolveCdkCli(appDir, env, undefined), undefined)
    })
})

describe('meetsMinimum', function () {
    it('accepts the minimum version and newer', function () {
        assert.ok(meetsMinimum('2.1132.0'))
        assert.ok(meetsMinimum('2.1146.1'))
    })

    it('rejects older and unparseable versions', function () {
        assert.ok(!meetsMinimum('2.1131.0'))
        assert.ok(!meetsMinimum('not-a-version'))
    })
})
