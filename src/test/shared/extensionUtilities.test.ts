/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'

import { writeFile, remove } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { mostRecentVersionKey, pluginVersion } from '../../shared/extensionUtilities'
import {
    createQuickStartWebview,
    isDifferentVersion,
    safeGet,
    setMostRecentVersion,
} from '../../shared/extensionUtilities'
import * as filesystemUtilities from '../../shared/filesystemUtilities'
import { FakeExtensionContext } from '../fakeExtensionContext'

describe('extensionUtilities', function () {
    describe('safeGet', function () {
        class Blah {
            public someProp?: string

            public constructor(someProp?: string) {
                this.someProp = someProp
            }
        }

        it('can access sub-property', function () {
            assert.strictEqual(
                safeGet(new Blah('hello!'), x => x.someProp),
                'hello!'
            )
            assert.strictEqual(
                safeGet(new Blah(), x => x.someProp),
                undefined
            )
            assert.strictEqual(
                safeGet(undefined as Blah | undefined, x => x.someProp),
                undefined
            )
        })
    })

    describe('createQuickStartWebview', async function () {
        const context = new FakeExtensionContext()
        let tempDir: string | undefined

        beforeEach(async function () {
            tempDir = await filesystemUtilities.makeTemporaryToolkitFolder()
            context.extensionPath = tempDir
        })

        afterEach(async function () {
            if (tempDir) {
                await remove(tempDir)
            }
        })

        it("throws error if a quick start page doesn't exist", async () => {
            await assert.rejects(createQuickStartWebview(context, 'irresponsibly-named-file'))
        })

        it('returns a webview with unaltered text if a valid file is passed without tokens', async function () {
            const filetext = 'this temp page does not have any tokens'
            const filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createQuickStartWebview(context, filepath)

            assert.strictEqual(typeof webview, 'object')
            const forcedWebview = webview as vscode.WebviewPanel
            assert.strictEqual(forcedWebview.webview.html.includes(filetext), true)
        })

        it('returns a webview with tokens replaced', async function () {
            const token = '!!EXTENSIONROOT!!'
            const basetext = 'this temp page has tokens: '
            const filetext = basetext + token
            const filepath = 'tokenless'
            await writeFile(path.join(context.extensionPath, filepath), filetext)
            const webview = await createQuickStartWebview(context, filepath)

            assert.strictEqual(typeof webview, 'object')
            const forcedWebview = webview as vscode.WebviewPanel

            const pathAsVsCodeResource = forcedWebview.webview.asWebviewUri(vscode.Uri.file(context.extensionPath))
            assert.strictEqual(forcedWebview.webview.html.includes(`${basetext}${pathAsVsCodeResource}`), true)
        })
    })

    describe('isDifferentVersion', function () {
        it('returns false if the version exists and matches the existing version exactly', function () {
            const goodVersion = '1.2.3'
            const extContext = new FakeExtensionContext()
            extContext.globalState.update(mostRecentVersionKey, goodVersion)

            assert.strictEqual(isDifferentVersion(extContext, goodVersion), false)
        })

        it("returns true if a most recent version isn't set", () => {
            const extContext = new FakeExtensionContext()

            assert.ok(isDifferentVersion(extContext))
        })

        it("returns true if a most recent version doesn't match the current version", () => {
            const oldVersion = '1.2.3'
            const newVersion = '4.5.6'
            const extContext = new FakeExtensionContext()
            extContext.globalState.update(mostRecentVersionKey, oldVersion)

            assert.ok(isDifferentVersion(extContext, newVersion))
        })
    })

    describe('setMostRecentVersion', function () {
        it('sets the most recent version', function () {
            const extContext = new FakeExtensionContext()
            setMostRecentVersion(extContext)

            assert.strictEqual(extContext.globalState.get<string>(mostRecentVersionKey), pluginVersion)
        })
    })
})
