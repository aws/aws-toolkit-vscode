/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import { createQuickStartWebview, safeGet } from '../../shared/extensionUtilities'
import { writeFile } from '../../shared/filesystem'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { assertRejects } from './utilities/assertUtils'

describe('extensionUtilities', () => {
    describe('safeGet', () => {

        class Blah {
            public someProp?: string

            public constructor(someProp?: string) {
                this.someProp = someProp
            }
        }

        it('can access sub-property', () => {
            assert.strictEqual(safeGet(new Blah('hello!'), x => x.someProp), 'hello!')
            assert.strictEqual(safeGet(new Blah(), x => x.someProp), undefined)
            assert.strictEqual(safeGet(undefined as Blah | undefined, x => x.someProp), undefined)
        })
    })

    describe('createQuickStartWebview', async () => {

        const context = new FakeExtensionContext()
        let tempDir: string | undefined

        beforeEach(async () => {
            tempDir = await filesystemUtilities.makeTemporaryToolkitFolder()
            context.extensionPath = tempDir
        })

        afterEach(async () => {
            if (tempDir) {
                await del(path.join(tempDir, '**'), { force: true })
            }
        })

        it ('throws error if a quick start page doesn\' exist', async () => {
            await assertRejects(async () => {await createQuickStartWebview(context, 'irresponsibly-named-file')})
        })

        it ('returns a webview with unaltered text if a valid file is passed without tokens', async () => {
            const filetext = 'this temp page does not have any tokens'
            const filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createQuickStartWebview(context, filepath)

            assert.strictEqual(typeof webview, 'object')
            const forcedWebview = webview as vscode.WebviewPanel
            assert.strictEqual(forcedWebview.webview.html, filetext)
        })

        it ('returns a webview with tokens replaced', async () => {
            const token = '!!EXTENSIONROOT!!'
            const basetext = 'this temp page has tokens: '
            const filetext = basetext + token
            const filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createQuickStartWebview(context, filepath)

            assert.strictEqual(typeof webview, 'object')
            const forcedWebview = webview as vscode.WebviewPanel
            assert.strictEqual(forcedWebview.webview.html, `${basetext}vscode-resource:${context.extensionPath}`)
        })
    })
})
