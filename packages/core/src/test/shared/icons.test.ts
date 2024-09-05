/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { Uri, ThemeIcon } from 'vscode'
import { codicon, getIcon } from '../../shared/icons'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'

describe('getIcon', function () {
    it('returns a ThemeIcon for `vscode` codicons', function () {
        const icon = getIcon('vscode-gear', false)

        assert.ok(icon instanceof ThemeIcon)
        assert.strictEqual(icon.id, 'gear')
    })

    it('returns a ThemeIcon for `aws` icons', function () {
        const icon = getIcon('aws-cdk-logo', false)

        assert.ok(icon instanceof ThemeIcon)
        assert.strictEqual(icon.id, 'aws-cdk-logo')
    })

    it('returns icon URIs for non-codicon icons', function () {
        const icon = getIcon('vscode-help', false)

        assert.ok(!(icon instanceof ThemeIcon))
        assert.ok(icon.dark.path.endsWith('/resources/icons/vscode/dark/help.svg'))
        assert.ok(icon.light.path.endsWith('/resources/icons/vscode/light/help.svg'))
    })

    it('can use specific icons for Cloud9', function () {
        const icon = getIcon('vscode-help', true)

        assert.ok(!(icon instanceof ThemeIcon))
        assert.ok(icon.dark.path.endsWith('/resources/icons/cloud9/dark/vscode-help.svg'))
        assert.ok(icon.light.path.endsWith('/resources/icons/cloud9/light/vscode-help.svg'))
    })

    it('can use generated icons for Cloud9', function () {
        const icon = getIcon('aws-cdk-logo', true)

        assert.ok(!(icon instanceof ThemeIcon))
        assert.ok(icon.dark.path.endsWith('/resources/icons/cloud9/generated/dark/aws-cdk-logo.svg'))
        assert.ok(icon.light.path.endsWith('/resources/icons/cloud9/generated/light/aws-cdk-logo.svg'))
    })

    it('can use codicons for Cloud9', function () {
        const icon = getIcon('vscode-gear', true)

        assert.ok(!(icon instanceof ThemeIcon))
        assert.ok(icon.dark.path.endsWith('/resources/icons/cloud9/generated/dark/vscode-gear.svg'))
        assert.ok(icon.light.path.endsWith('/resources/icons/cloud9/generated/light/vscode-gear.svg'))
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
                await fs.mkdirp(path.dirname(p))
                await fs.writeFile(p, '<svg></svg>')
            }

            const icon = getIcon('aws-cdk-logo', false, tempDir)

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
            await fs.mkdirp(path.dirname(logoPath))
            await fs.writeFile(logoPath, '<svg></svg>')

            const icon = getIcon('aws-cdk-logo', false, tempDir)

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
