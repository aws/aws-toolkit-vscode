/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as assert from 'assert'
import * as vscode from 'vscode'
import { join } from 'path'
import { readdirSync } from 'fs'
import { generateIconsMap } from '../../../samVisualize/rendering/icons'
import { getProjectDir } from '../../testUtil'
import { trimExtension } from '../../../shared/utilities/pathUtils'

const iconsDir = join(getProjectDir(), '..', '..', 'resources', 'light', 'samVisualize', 'icons')
let icons: Array<string>
let testWebview: vscode.Webview

describe('generateIconsMap', function () {
    before(function () {
        testWebview = vscode.window.createWebviewPanel('test', 'testWebview', vscode.ViewColumn.One).webview
    })

    it('A IconURIMap is generated containing a valid webviewURI for each icon available', function () {
        const iconURIMap: { [resourceType: string]: string } = generateIconsMap(iconsDir, testWebview)

        icons = readdirSync(iconsDir)

        assert.strictEqual(Object.values(iconURIMap).length, icons.length)

        for (const icon of icons) {
            // Only svg icons
            assert.strictEqual(icon.endsWith('.svg'), true)

            const iconPath = join(iconsDir, icon)
            // Icon <a>-<b>.svg (or <a>-<b>-<c>.svg) is used for resource type <a>::<b>::* (or <a>::<b>::<c>)
            const resourceType = trimExtension(icon).replace('-', '::')

            const expectedWebviewURI = testWebview.asWebviewUri(vscode.Uri.file(iconPath)).toString()
            assert.strictEqual(iconURIMap[resourceType], expectedWebviewURI)
        }
    })
})
