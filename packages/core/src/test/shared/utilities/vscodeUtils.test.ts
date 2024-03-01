/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { VSCODE_EXTENSION_ID } from '../../../shared/extensions'
import * as vscodeUtil from '../../../shared/utilities/vsCodeUtils'
import * as vscode from 'vscode'
import { getExcludePattern } from '../../../shared/fs/watchedFiles'

describe('vscodeUtils', async function () {
    it('activateExtension(), isExtensionActive()', async function () {
        assert.deepStrictEqual(await vscodeUtil.activateExtension('invalid.extension'), undefined)
        await assert.rejects(async () => {
            await vscodeUtil.activateExtension('invalid', false)
        })

        assert.deepStrictEqual(vscodeUtil.isExtensionActive('invalid.extension'), false)

        await vscodeUtil.activateExtension(VSCODE_EXTENSION_ID.awstoolkitcore, false)
        assert.deepStrictEqual(vscodeUtil.isExtensionActive(VSCODE_EXTENSION_ID.awstoolkitcore), true)
    })

    it('globDirPatterns()', async function () {
        const input = ['foo', '**/bar/**', '*baz*', '**/*with.star*/**', '/zub', 'zim/', '/zoo/']
        assert.deepStrictEqual(vscodeUtil.globDirPatterns(input), [
            'foo',
            'bar',
            'baz',
            '*with.star*',
            'zub',
            'zim',
            'zoo',
        ])
    })

    it('watchedFiles.getExcludePattern()', async function () {
        // If vscode defaults change in the future, just update this test.
        // We intentionally want visibility into real-world defaults.
        assert.match(getExcludePattern(), /node_modules,bower_components,\*\.code-search,/)
    })
})

describe('isExtensionInstalled()', function () {
    const smallerVersion = '0.9.0'
    const extVersion = '1.0.0'
    const largerVersion = '2.0.0'
    const extId = 'my.ext.id'
    let ext: vscode.Extension<any>
    let getExtension: (extId: string) => vscode.Extension<any>

    beforeEach(function () {
        ext = {
            packageJSON: {
                version: extVersion,
            },
        } as vscode.Extension<any>
        getExtension = _ => ext
    })

    it('fails if extension could not be found', function () {
        const noExtFunc = (extId: string) => undefined
        assert.ok(!vscodeUtil.isExtensionInstalled(extId, undefined, noExtFunc))
    })

    it('succeeds on same min version', function () {
        assert.ok(vscodeUtil.isExtensionInstalled(extId, extVersion, getExtension))
    })

    it('succeeds on smaller min version', function () {
        assert.ok(vscodeUtil.isExtensionInstalled(extId, smallerVersion, getExtension))
    })

    it('fails on larger min version', function () {
        assert.ok(!vscodeUtil.isExtensionInstalled(extId, largerVersion, getExtension))
    })

    it('can handle labels on a version', function () {
        ext.packageJSON.version = `${extVersion}-SNAPSHOT`
        assert.ok(vscodeUtil.isExtensionInstalled(extId, `${smallerVersion}-ALPHA`, getExtension))
    })

    it('is valid when no min version is provided', function () {
        assert.ok(vscodeUtil.isExtensionInstalled(extId, undefined, getExtension))
    })

    it('fails on malformed version', function () {
        // malformed min version
        assert.ok(!vscodeUtil.isExtensionInstalled(extId, 'malformed.version', getExtension))

        // malformed ext version
        ext.packageJSON.version = 'malformed.version'
        assert.ok(!vscodeUtil.isExtensionInstalled(extId, extVersion, getExtension))
    })
})

describe('buildMissingExtensionMessage()', function () {
    const extId = 'MY.EXT.ID'
    const extName = 'MY EXTENSION'
    const minVer = '1.0.0'
    const feat = 'FEATURE'

    // Test when a minVer is given
    it('minVer', function () {
        const message = vscodeUtil.buildMissingExtensionMessage(extId, extName, minVer, feat)
        assert.strictEqual(
            message,
            `${feat} requires the ${extName} extension (\'${extId}\' of version >=${minVer}) to be installed and enabled.`
        )
    })

    // Test when a minVer is not given
    it('no minVer', function () {
        const message = vscodeUtil.buildMissingExtensionMessage(extId, extName, undefined, feat)
        assert.strictEqual(
            message,
            `${feat} requires the ${extName} extension (\'${extId}\') to be installed and enabled.`
        )
    })
})
