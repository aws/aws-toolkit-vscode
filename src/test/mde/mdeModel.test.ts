/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as model from '../../mde/mdeModel'
import * as mdeSSH from '../../mde/mdeSSHConfig'
import { Repository } from '../../../types/git'
import { fileExists, makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { startSshAgent } from '../../shared/extensions/ssh'

describe('mdeModel', async function () {
    describe('getEmailHash', async function () {
        it('returns undefined if no email is found', async function () {
            assert.strictEqual(
                await model.getEmailHash({
                    getConfig: async (repo?: Repository) => {
                        return {}
                    },
                }),
                undefined
            )
        })

        it('returns a hashed email', async function () {
            assert.strictEqual(
                await model.getEmailHash({
                    getConfig: async (repo?: Repository) => {
                        return { 'user.email': 'hashSlingingSlasher@asdf.com' }
                    },
                }),
                'ed2edc6bcfa2d82a9b6555203a6e98b456e8be433ebfed0e8e787b23cd4e1369'
            )
        })
    })
})

describe('getTagsAndLabels', function () {
    it('returns tags and labels', function () {
        const out = model.getTagsAndLabels({
            tags: {
                tagA: 'val1',
                tagB: 'val2',
                labelA: '',
                labelB: '',
                tagC: 'val3',
                labelC: '',
            },
        })

        assert.deepStrictEqual(out.tags, { tagA: 'val1', tagB: 'val2', tagC: 'val3' })
        assert.deepStrictEqual(out.labels.sort(), ['labelA', 'labelB', 'labelC'])
    })

    it('returns no tags and an empty array for labels', function () {
        const out = model.getTagsAndLabels({ tags: {} })

        assert.deepStrictEqual(out.tags, {})
        assert.deepStrictEqual(out.labels, [])
    })
})

describe('makeLabelsString', function () {
    it('makes and alphabetizes a label string', function () {
        const str = model.makeLabelsString({
            tags: {
                tagA: 'val1',
                tagB: 'val2',
                labelC: '',
                labelA: '',
                tagC: 'val3',
                labelB: '',
            },
        })

        assert.strictEqual(str, 'labelA | labelB | labelC')
    })

    it('returns a blank str if no labels are present', function () {
        const str = model.makeLabelsString({ tags: {} })

        assert.strictEqual(str, '')
    })
})

describe('SSH Agent', function () {
    it('can start the agent on windows', async function () {
        // TODO: we should also skip this test if not running in CI
        // Local machines probably won't have admin permissions in the spawned processes
        if (process.platform !== 'win32') {
            this.skip()
        }

        const runCommand = (command: string) => {
            const args = ['-Command', command]
            return new ChildProcess('powershell.exe', args).run({ rejectOnErrorCode: true })
        }

        const getStatus = () => {
            return runCommand('echo (Get-Service ssh-agent).Status').then(o => o.stdout)
        }

        await runCommand('Stop-Service ssh-agent')
        assert.strictEqual(await getStatus(), 'Stopped')
        await startSshAgent()
        assert.strictEqual(await getStatus(), 'Running')
    })
})

describe('Connect Script', function () {
    let context: FakeExtensionContext

    function isWithin(path1: string, path2: string): boolean {
        const rel = path.relative(path1, path2)
        return !path.isAbsolute(rel) && !rel.startsWith('..') && !!rel
    }

    beforeEach(async function () {
        context = await FakeExtensionContext.create()
        context.globalStoragePath = await makeTemporaryToolkitFolder()
    })

    it('can get a connect script path, adding a copy to global storage', async function () {
        const script = await mdeSSH.ensureConnectScript(context)
        assert.ok(await fileExists(script))
        assert.ok(isWithin(context.globalStoragePath, script))
    })

    it('can run the script with environment variables', async function () {
        const script = await mdeSSH.ensureConnectScript(context)
        const env = model.getMdeSsmEnv('us-weast-1', 'echo', {
            id: '01234567890',
            accessDetails: { streamUrl: '123', tokenValue: '456' },
        })

        // This could be de-duped
        const isWindows = process.platform === 'win32'
        const cmd = isWindows ? 'powershell.exe' : script
        const args = isWindows ? ['-ExecutionPolicy', 'Bypass', '-File', script, 'bar'] : [script, 'bar']

        const output = await new ChildProcess(cmd, args).run({ spawnOptions: { env } })
        assert.strictEqual(output.exitCode, 0, 'Connect script should exit with a zero status')
    })
})
