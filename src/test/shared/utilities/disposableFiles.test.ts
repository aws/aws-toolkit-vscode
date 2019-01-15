/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import '../vscode/initialize'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as fileSystem from '../../../shared/filesystem'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import { DisposableFiles, ExtensionDisposableFiles } from '../../../shared/utilities/disposableFiles'
import { types as vscode } from '../../../shared/vscode'

describe('DisposableFiles', async () => {
    let tempFolder: string

    beforeEach(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk'))
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('deletes file on dispose', async () => {
        const tempFile = path.join(tempFolder, 'file.txt')
        await fileSystem.writeFileAsync(tempFile, 'hi')

        const disposable = new DisposableFiles()
            .addFile(tempFile)

        disposable.dispose()

        assert.strictEqual(await filesystemUtilities.fileExists(tempFile), false)
    })

    it('deletes folder on dispose', async () => {
        const testTempFolder = path.join(tempFolder, 'qwerty')
        await fileSystem.mkdirAsync(testTempFolder)

        const disposable = new DisposableFiles()
            .addFolder(testTempFolder)

        disposable.dispose()

        assert.strictEqual(await filesystemUtilities.fileExists(testTempFolder), false)
    })

    it('deletes folder containing contents on dispose', async () => {
        const testTempFolder = path.join(tempFolder, 'qwerty')
        await fileSystem.mkdirAsync(testTempFolder)
        await fileSystem.writeFileAsync(path.join(testTempFolder, 'file1.txt'), 'hi')
        await fileSystem.writeFileAsync(path.join(testTempFolder, 'file2.txt'), 'hi')
        await fileSystem.writeFileAsync(path.join(testTempFolder, 'file3.txt'), 'hi')
        await fileSystem.mkdirAsync(path.join(testTempFolder, 'subfolder1'))
        await fileSystem.mkdirAsync(path.join(testTempFolder, 'subfolder2'))
        await fileSystem.mkdirAsync(path.join(testTempFolder, 'subfolder3'))

        const disposable = new DisposableFiles()
            .addFolder(testTempFolder)

        disposable.dispose()

        assert.strictEqual(await filesystemUtilities.fileExists(testTempFolder), false)
    })

    it('is okay deleting a parent folder before a child folder', async () => {
        const testTempFolder = path.join(tempFolder, 'qwerty')
        const subFolder1 = path.join(tempFolder, 'child1')
        const subFolder2 = path.join(subFolder1, 'child2')
        const subFolder3 = path.join(subFolder2, 'child3')
        await fileSystem.mkdirAsync(testTempFolder)
        await fileSystem.mkdirAsync(subFolder1)
        await fileSystem.mkdirAsync(subFolder2)
        await fileSystem.mkdirAsync(subFolder3)

        const disposable = new DisposableFiles()
            .addFolder(testTempFolder)
            .addFolder(subFolder1)
            .addFolder(subFolder2)
            .addFolder(subFolder3)

        disposable.dispose()

        assert.strictEqual(await filesystemUtilities.fileExists(testTempFolder), false)
    })

})

describe('ExtensionDisposableFiles', async () => {

    class TestExtensionDisposableFiles extends ExtensionDisposableFiles {
        public static reset() {
            ExtensionDisposableFiles.INSTANCE = undefined
        }
    }

    let extensionContext: vscode.ExtensionContext

    beforeEach(() => {
        extensionContext = {
            subscriptions: []
        } as any as vscode.ExtensionContext
    })

    afterEach(() => {
        TestExtensionDisposableFiles.reset()
    })

    it('getInstance throws error if not initialized', async () => {
        try {
            ExtensionDisposableFiles.getInstance()
            assert.strictEqual(true, false, 'error expected')
        } catch (err) {
            assert.notStrictEqual(err, undefined)
        }
    })

    it('cannot be initialized twice', async () => {
        await ExtensionDisposableFiles.initialize(extensionContext)

        try {
            await ExtensionDisposableFiles.initialize(extensionContext)
            assert.strictEqual(true, false, 'error expected')
        } catch (err) {
            assert.notStrictEqual(err, undefined)
        }
    })

    it('creates temp folder on initialization', async () => {
        await ExtensionDisposableFiles.initialize(extensionContext)

        assert.ok(ExtensionDisposableFiles.getInstance().toolkitTempFolder)

        assert.strictEqual(
            await filesystemUtilities.fileExists(ExtensionDisposableFiles.getInstance().toolkitTempFolder),
            true
        )
    })
})
