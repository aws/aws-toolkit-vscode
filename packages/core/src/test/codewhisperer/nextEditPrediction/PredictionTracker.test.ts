/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as path from 'path'
import assert from 'assert'
import {
    FileSnapshot,
    FileTrackerConfig,
    PredictionTracker,
} from '../../../codewhisperer/nextEditPrediction/PredictionTracker'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { createMockDocument } from '../testUtil'
import * as diffGenerator from '../../../codewhisperer/nextEditPrediction/diffContextGenerator'
import fs from '../../../shared/fs/fs'

describe('PredictionTracker', function () {
    let sandbox: sinon.SinonSandbox
    let mockExtensionContext: vscode.ExtensionContext
    let storagePath: string
    let tracker: PredictionTracker
    // File system stubs
    let existsDirStub: sinon.SinonStub
    let writeFileStub: sinon.SinonStub
    let readFileTextStub: sinon.SinonStub
    let existsStub: sinon.SinonStub
    let deleteStub: sinon.SinonStub
    let readdirStub: sinon.SinonStub
    let statStub: sinon.SinonStub
    let clock: sinon.SinonFakeTimers

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        clock = sandbox.useFakeTimers({
            now: new Date('2025-04-21T12:00:00Z').getTime(),
            shouldAdvanceTime: true,
        })

        storagePath = '/fake/storage/path'
        const mockStorage = vscode.Uri.file(storagePath)
        mockExtensionContext = await FakeExtensionContext.create()
        Object.defineProperty(mockExtensionContext, 'storageUri', {
            get: () => mockStorage,
        })

        // Initialize all file system stubs
        sandbox.stub(fs, 'mkdir').resolves()
        existsDirStub = sandbox.stub(fs, 'existsDir').resolves(false)
        writeFileStub = sandbox.stub(fs, 'writeFile').resolves()
        readFileTextStub = sandbox.stub(fs, 'readFileText')
        existsStub = sandbox.stub(fs, 'exists')
        deleteStub = sandbox.stub(fs, 'delete').resolves()
        readdirStub = sandbox.stub(fs, 'readdir').resolves([])
        statStub = sandbox.stub(fs, 'stat') // mock file size
    })

    afterEach(function () {
        sandbox.restore()
        clock.restore()
    })

    describe('takeSnapshot', function () {
        let filePath: string
        let previousContent: string

        beforeEach(function () {
            filePath = '/path/to/file.js'
            previousContent = 'previous content'
            tracker = new PredictionTracker(mockExtensionContext)
        })

        it('should save snapshot to storage', async function () {
            const timestamp = Date.now()
            const storageKey = `${filePath.replace(/\//g, '__')}-${timestamp}`
            await (tracker as any).takeSnapshot(filePath, previousContent)

            // Check if the snapshot was saved to storage
            const snapshotsDirPath = path.join(storagePath, 'AmazonQ-file-snapshots')
            const snapshotPath = path.join(snapshotsDirPath, `${storageKey}.nep-snapshot`)
            assert.ok(writeFileStub.calledWith(snapshotPath, previousContent))
        })

        it('should not add new snapshot within debounce interval', async function () {
            await (tracker as any).takeSnapshot(filePath, 'first edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Another edit within debounce interval, should not add another snapshot
            await (tracker as any).takeSnapshot(filePath, 'second edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)
        })

        it('should add new snapshot after debounce interval', async function () {
            await (tracker as any).takeSnapshot(filePath, 'first edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Another edit after debounce interval, should add another snapshot
            await clock.tickAsync(tracker.config.debounceIntervalMs + 100)
            await (tracker as any).takeSnapshot(filePath, 'second edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 2)
        })

        it('should delete snapshot after maxAgeMs', async function () {
            const customConfig: Partial<FileTrackerConfig> = {
                maxAgeMs: 10000,
            }
            tracker = new PredictionTracker(mockExtensionContext, customConfig)
            await (tracker as any).takeSnapshot(filePath, previousContent)

            // Advance time just under the maxAgeMs, snapshot should still exist
            await clock.tickAsync(tracker.config.maxAgeMs - 1000)
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Advance time past the maxAgeMs, snapshot should have been removed
            await clock.tickAsync(3000)
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 0)
        })
    })

    describe('enforceMemoryLimits', function () {
        beforeEach(function () {
            tracker = new PredictionTracker(mockExtensionContext)
        })

        it('should remove oldest snapshots when storage size exceeds limit', async function () {
            // Very small storage limit
            const customConfig: Partial<FileTrackerConfig> = {
                maxStorageSizeKb: 0.1,
            }
            tracker = new PredictionTracker(mockExtensionContext, customConfig)

            const file1 = '/path/to/file1.js'
            const file2 = '/path/to/file2.js'

            // First snapshot for file1 (oldest)
            await (tracker as any).takeSnapshot(file1, 'content 1')
            await clock.tickAsync(1000)

            // Second snapshot for file1
            await (tracker as any).takeSnapshot(file1, 'content 2')
            await clock.tickAsync(1000)

            // First snapshot for file2
            await (tracker as any).takeSnapshot(file2, 'content 3')

            await (tracker as any).enforceMemoryLimits()

            // Oldest snapshot should be removed
            const file1Snapshots = tracker.getFileSnapshots(file1)
            assert.strictEqual(file1Snapshots.length, 1)
        })
    })

    describe('getFileSnapshots', function () {
        beforeEach(function () {
            tracker = new PredictionTracker(mockExtensionContext)
        })

        it('should return empty array for non-existent file', function () {
            const result = tracker.getFileSnapshots('/non-existent/file.js')
            assert.deepStrictEqual(result, [])
        })

        it('should return snapshots for existing file', async function () {
            const file = '/path/to/file.js'
            await (tracker as any).takeSnapshot(file, 'content')

            const result = tracker.getFileSnapshots(file)
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0].filePath, file)
        })
    })

    describe('getSnapshotContent', function () {
        let file: string
        let snapshot: FileSnapshot

        beforeEach(async function () {
            tracker = new PredictionTracker(mockExtensionContext)
            file = '/path/to/file.js'
            await (tracker as any).takeSnapshot(file, 'snapshot content')

            snapshot = tracker.getFileSnapshots(file)[0]
        })

        it('should retrieve snapshot content from storage', async function () {
            // Set up readFileText to return content
            readFileTextStub.resolves('snapshot content')

            const content = await tracker.getSnapshotContent(snapshot)
            assert.strictEqual(content, 'snapshot content')

            // Check path passed to readFileText
            const snapshotsDirPath = path.join(storagePath, 'AmazonQ-file-snapshots')
            const snapshotPath = path.join(snapshotsDirPath, `${snapshot.storageKey}.nep-snapshot`)
            assert.ok(readFileTextStub.calledWith(snapshotPath))
        })

        it('should throw error if read fails', async function () {
            // Set up readFileText to throw
            readFileTextStub.rejects(new Error('Read error'))

            try {
                await tracker.getSnapshotContent(snapshot)
                assert.fail('Should have thrown an error')
            } catch (err) {
                assert.ok(err instanceof Error)
                assert.ok((err as Error).message.includes('Failed to read snapshot content'))
            }
        })
    })

    describe('generatePredictionSupplementalContext', function () {
        let mockEditor: vscode.TextEditor
        let diffGenerateStub: sinon.SinonStub

        beforeEach(function () {
            tracker = new PredictionTracker(mockExtensionContext)

            // Mock active editor, we only care about document
            mockEditor = {
                document: createMockDocument('current content', '/path/to/active.js'),
                selection: new vscode.Selection(0, 0, 0, 0),
                selections: [new vscode.Selection(0, 0, 0, 0)],
                options: {},
                visibleRanges: [],
                edit: () => Promise.resolve(true),
                insertSnippet: () => Promise.resolve(true),
                setDecorations: () => {},
                revealRange: () => {},
                show: () => {},
                hide: () => {},
                viewColumn: vscode.ViewColumn.One,
            } as vscode.TextEditor

            sandbox.stub(vscode.window, 'activeTextEditor').value(mockEditor)

            // Mock diffGenerator.generateDiffContexts
            diffGenerateStub = sandbox.stub(diffGenerator, 'generateDiffContexts').resolves([])
        })

        it('should return empty array if no snapshots', async function () {
            const result = await tracker.generatePredictionSupplementalContext()
            assert.deepStrictEqual(result, [])
        })

        it('should generate and return supplemental contexts', async function () {
            const filePath = '/path/to/active.js'

            await (tracker as any).takeSnapshot(filePath, 'old content 1')
            await clock.tickAsync(tracker.config.debounceIntervalMs + 100)
            await (tracker as any).takeSnapshot(filePath, 'old content 2')

            const getSnapshotContentStub = sandbox.stub(tracker, 'getSnapshotContent')
            getSnapshotContentStub.resolves('snapshot content')

            const mockContexts = [
                { filePath, content: 'diff1', type: 'PreviousEditorState' },
                { filePath, content: 'diff2', type: 'PreviousEditorState' },
            ]
            diffGenerateStub.resolves(mockContexts)

            const result = await tracker.generatePredictionSupplementalContext()

            // Should have called generateDiffContexts with the right params
            assert.ok(diffGenerateStub.called)
            assert.strictEqual(diffGenerateStub.args[0][0], filePath)
            assert.strictEqual(diffGenerateStub.args[0][1], 'current content')
            assert.strictEqual(diffGenerateStub.args[0][2].length, 2)
            assert.strictEqual(diffGenerateStub.args[0][3], tracker.config.maxSupplementalContext)

            // Should return the contexts from generateDiffContexts
            assert.deepStrictEqual(result, mockContexts)
        })
    })

    describe('loadSnapshotsFromStorage', function () {
        beforeEach(function () {
            tracker = new PredictionTracker(mockExtensionContext)
        })

        it('should load snapshots from storage', async function () {
            // Directory exists
            existsDirStub.resolves(true)
            const currentTimeStamp = Date.now()

            // Mock readdir to return snapshot files
            readdirStub.resolves([
                [`file1-${currentTimeStamp}.nep-snapshot`, vscode.FileType.File],
                [`file1-${currentTimeStamp - 100}.nep-snapshot`, vscode.FileType.File],
                [`file2-${currentTimeStamp - 200}.nep-snapshot`, vscode.FileType.File],
                ['not-a-snapshot.txt', vscode.FileType.File], // Should be ignored
            ])
            existsStub.resolves(true)
            statStub.resolves({ size: 100 })

            await (tracker as any).loadSnapshotsFromStorage()

            // Verify tracked files
            const trackedFiles = tracker.getTrackedFiles()
            assert.strictEqual(trackedFiles.length, 2)
            assert.ok(trackedFiles.includes('file1'))
            assert.ok(trackedFiles.includes('file2'))

            // Verify snapshot counts
            assert.strictEqual(tracker.getTotalSnapshotCount(), 3)
            assert.strictEqual(tracker.getTotalSize(), 300)
        })

        it('should sort snapshots by timestamp', async function () {
            // Directory exists
            existsDirStub.resolves(true)
            const newestTimeStamp = Date.now()
            const oldestTimeStamp = newestTimeStamp - 100
            const middleTimeStamp = newestTimeStamp - 50

            // Mock readdir to return snapshot files for the same file with different timestamps
            readdirStub.resolves([
                [`file1-${oldestTimeStamp}.nep-snapshot`, vscode.FileType.File],
                [`file1-${newestTimeStamp}.nep-snapshot`, vscode.FileType.File],
                [`file1-${middleTimeStamp}.nep-snapshot`, vscode.FileType.File],
            ])
            existsStub.resolves(true)
            statStub.resolves({ size: 100 })

            await (tracker as any).loadSnapshotsFromStorage()

            const trackedFiles = tracker.getTrackedFiles()
            assert.strictEqual(trackedFiles.length, 1)
            assert.strictEqual(trackedFiles[0], 'file1')

            const snapshots = tracker.getFileSnapshots('file1')
            assert.strictEqual(snapshots.length, 3)
            assert.strictEqual(snapshots[0].timestamp, oldestTimeStamp)
            assert.strictEqual(snapshots[1].timestamp, middleTimeStamp)
            assert.strictEqual(snapshots[2].timestamp, newestTimeStamp)
        })

        it('should delete snapshots for files that no longer exist or too old', async function () {
            existsDirStub.resolves(true)
            const expiredTimeStamp = Date.now() - 50000 // this snapshot is out-of-date

            readdirStub.resolves([
                ['deleted-file-1234567890.nep-snapshot', vscode.FileType.File],
                [`file1-${expiredTimeStamp}.nep-snapshot`, vscode.FileType.File],
            ])

            // First file doesn't exist anymore
            existsStub.onFirstCall().resolves(false)

            await (tracker as any).loadSnapshotsFromStorage()
            assert.ok(deleteStub.calledTwice)

            // No tracked files
            assert.strictEqual(tracker.getTrackedFiles().length, 0)
        })
    })
})
