/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import { Uri, ThemeIcon } from 'vscode'
import { codicon, getIcon } from '../../shared/icons'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import { fs } from '../../shared'

describe('getIcon', function () {
    it('returns a ThemeIcon for `vscode` codicons', function () {
        const icon = getIcon('vscode-gear')

        assert.ok(icon instanceof ThemeIcon)
        assert.strictEqual(icon.id, 'gear')
    })

    it('can use overrides for contributed icons', async function () {
        const tempDir = await makeTemporaryToolkitFolder()

        const paths = [
            path.join(tempDir, 'aws', 'cdk', 'logo.svg'),
            path.join(tempDir, 'aws', 'dark', 'cdk-logo.svg'),
            path.join(tempDir, 'aws', 'light', 'cdk-logo.svg'),
        ]

        try {
            for (const p of paths) {
                await fs.mkdir(path.dirname(p))
                await fs.writeFile(p, '<svg></svg>')
            }

            const icon = getIcon('aws-cdk-logo', tempDir)

            assert.ok(!(icon instanceof ThemeIcon))
            assert.strictEqual(icon.dark.fsPath, Uri.file(paths[1]).fsPath)
            assert.strictEqual(icon.light.fsPath, Uri.file(paths[2]).fsPath)
        } finally {
            await tryRemoveFolder(tempDir)
        }
    })

    it('provides the icon source if available', async function () {
        const tempDir = await makeTemporaryToolkitFolder()
        const logoPath = path.join(tempDir, 'aws', 'cdk', 'logo.svg')

        try {
            await fs.mkdir(path.dirname(logoPath))
            await fs.writeFile(logoPath, '<svg></svg>')

            const icon = getIcon('aws-cdk-logo', tempDir)

            assert.ok(icon instanceof ThemeIcon)
            assert.strictEqual(icon.source?.fsPath, Uri.file(logoPath).fsPath)
        } finally {
            await tryRemoveFolder(tempDir)
        }
    })
})

describe('codicon', function () {
    it('inserts icon ids', function () {
        const result = codicon`my icon: ${getIcon('vscode-gear')}`
        assert.strictEqual(result, 'my icon: $(gear)')
    })

    it('skips adding icons if no icon font is available', function () {
        const result = codicon`my icon: ${getIcon('vscode-help')}`
        assert.strictEqual(result, 'my icon:')
    })

    it('trims the resulting string', function () {
        const result = codicon`  some text ${getIcon('vscode-help')}      `
        assert.strictEqual(result, 'some text')
    })
})
