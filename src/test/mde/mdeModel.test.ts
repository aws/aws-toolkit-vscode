/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import { Repository } from '../../../types/git'
import {
    getConnectScriptPath,
    getEmailHash,
    getMdeSsmEnv,
    getTagsAndLabels,
    makeLabelsString,
} from '../../mde/mdeModel'
import { fileExists, makeTemporaryToolkitFolder } from '../../shared/filesystemUtilities'
import { ChildProcess } from '../../shared/utilities/childProcess'
import { FakeExtensionContext } from '../fakeExtensionContext'

describe('mdeModel', async function () {
    describe('getEmailHash', async function () {
        it('returns undefined if no email is found', async function () {
            assert.strictEqual(
                await getEmailHash({
                    getConfig: async (repo?: Repository) => {
                        return {}
                    },
                }),
                undefined
            )
        })

        it('returns a hashed email', async function () {
            assert.strictEqual(
                await getEmailHash({
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
        const out = getTagsAndLabels({
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
        const out = getTagsAndLabels({ tags: {} })

        assert.deepStrictEqual(out.tags, {})
        assert.deepStrictEqual(out.labels, [])
    })
})

describe('makeLabelsString', function () {
    it('makes and alphabetizes a label string', function () {
        const str = makeLabelsString({
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
        const str = makeLabelsString({ tags: {} })

        assert.strictEqual(str, '')
    })
})

describe('Connect Script', function () {
    let context: FakeExtensionContext

    function isWithin(path1: string, path2: string): boolean {
        const rel = path.relative(path1, path2)
        return !path.isAbsolute(rel) && !rel.startsWith('..') && !!rel
    }

    beforeEach(async function () {
        context = new FakeExtensionContext()
        context.globalStoragePath = await makeTemporaryToolkitFolder()
    })

    it('can get a connect script path, adding a copy to global storage', async function () {
        const script = await getConnectScriptPath(context)
        assert.ok(await fileExists(script))
        assert.ok(isWithin(context.globalStoragePath, script))
    })

    it('can run the script with environment variables', async function () {
        const script = await getConnectScriptPath(context)
        const env = getMdeSsmEnv('foo', 'echo', {
            id: 'e-01234567890',
            accessDetails: { streamUrl: '123', tokenValue: '456' },
        })

        const output = await new ChildProcess(script).run({ spawnOptions: { env } })
        assert.strictEqual(output.exitCode, 0, 'Connect script should exit with a zero status')
    })
})
