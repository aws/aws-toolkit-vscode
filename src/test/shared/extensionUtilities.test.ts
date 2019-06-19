/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import * as vscode from 'vscode'
import { createWelcomeWebview, safeGet } from '../../shared/extensionUtilities'
import { writeFile } from '../../shared/filesystem'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import { FakeExtensionContext } from '../fakeExtensionContext'

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

    describe('createWelcomeWebview', async () => {

        const context = new FakeExtensionContext()
        let filepath: string | undefined

        before(async () => {
            const tempDir = await filesystemUtilities.makeTemporaryToolkitFolder()
            context.extensionPath = tempDir
        })

        afterEach(async () => {
            if (filepath && await filesystemUtilities.fileExists(filepath)) {
                await del(filepath, { force: true })
            }
        })

        after(async () => {
            await del(context.extensionPath, { force: true })
        })

        it ('returns void if a welcome page doesn\' exist', async () => {
            const webview = await createWelcomeWebview(context, 'irresponsibly-named-file')
            assert.ok(typeof webview !== 'object')
        })

        it ('returns a webview with unaltered text if a valid file is passed without tokens', async () => {
            const filetext = 'this temp welcome page does not have any tokens'
            filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createWelcomeWebview(context, filepath)

            assert.ok(typeof webview === 'object')
            const forcedWebview = webview as vscode.WebviewPanel
            assert.strictEqual(forcedWebview.webview.html, filetext)
        })

        it ('returns a webview with tokens replaced', async () => {
            const token = '!!EXTENSIONROOT!!'
            const basetext = 'this temp welcome page has tokens: '
            const filetext = basetext + token
            filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createWelcomeWebview(context, filepath)

            assert.ok(typeof webview === 'object')
            const forcedWebview = webview as vscode.WebviewPanel
            assert.strictEqual(forcedWebview.webview.html, `${basetext}vscode-resource:${context.extensionPath}`)
        })
    })
})
