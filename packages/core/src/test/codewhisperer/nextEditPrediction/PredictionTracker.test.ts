/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import {
    FileSnapshot,
    FileTrackerConfig,
    PredictionTracker,
} from '../../../codewhisperer/nextEditPrediction/PredictionTracker'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { createMockDocument } from '../testUtil'
import * as diffGenerator from '../../../codewhisperer/nextEditPrediction/diffContextGenerator'
import globals from '../../../shared/extensionGlobals'

describe('PredictionTracker', function () {
    let sandbox: sinon.SinonSandbox
    let mockExtensionContext: vscode.ExtensionContext
    let tracker: PredictionTracker
    let clock: sinon.SinonFakeTimers
    let dateNowStub: sinon.SinonStub

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        // Set a base time for tests
        const startTime = new Date('2025-04-21T12:00:00Z').getTime()

        clock = sandbox.useFakeTimers({
            now: startTime,
            shouldAdvanceTime: true,
        })

        // Set up a stub for globals.clock.Date.now() that we can control manually
        dateNowStub = sandbox.stub(globals.clock.Date, 'now')
        dateNowStub.returns(startTime)

        mockExtensionContext = await FakeExtensionContext.create()
    })

    afterEach(function () {
        sandbox.restore()
        clock.restore()
    })

    describe('processEdit', function () {
        let filePath: string
        let previousContent: string
        let mockDocument: vscode.TextDocument

        beforeEach(function () {
            filePath = '/path/to/file.js'
            previousContent = 'previous content'
            tracker = new PredictionTracker(mockExtensionContext)

            // Create a mock document
            mockDocument = createMockDocument(previousContent, filePath)
        })

        it('should store snapshot in memory', async function () {
            await tracker.processEdit(mockDocument, previousContent)
            const snapshots = tracker.getFileSnapshots(filePath)

            assert.strictEqual(snapshots.length, 1)
            assert.strictEqual(snapshots[0].content, previousContent)
            assert.strictEqual(snapshots[0].size, Buffer.byteLength(previousContent, 'utf8'))
        })

        it('should not add new snapshot within debounce interval', async function () {
            await tracker.processEdit(mockDocument, 'first edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Another edit within debounce interval, should not add another snapshot
            await tracker.processEdit(mockDocument, 'second edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)
        })

        it('should add new snapshot after debounce interval', async function () {
            const initialTime = globals.clock.Date.now()
            await tracker.processEdit(mockDocument, 'first edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Another edit after debounce interval, should add another snapshot
            const laterTime = initialTime + tracker.config.debounceIntervalMs + 1000
            dateNowStub.returns(laterTime)
            await tracker.processEdit(mockDocument, 'second edit')
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 2)

            // Verify the content of the second snapshot
            const snapshots = tracker.getFileSnapshots(filePath)
            assert.strictEqual(snapshots[1].content, 'second edit')
        })

        it('should delete snapshot after maxAgeMs', async function () {
            const customConfig: Partial<FileTrackerConfig> = {
                maxAgeMs: 10000,
            }
            tracker = new PredictionTracker(mockExtensionContext, customConfig)
            const initialTime = globals.clock.Date.now()
            await tracker.processEdit(mockDocument, previousContent)
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Advance time just under the maxAgeMs, snapshot should still exist
            dateNowStub.returns(initialTime + tracker.config.maxAgeMs - 1000)
            await clock.tickAsync(tracker.config.maxAgeMs - 1000)
            assert.strictEqual(tracker.getFileSnapshots(filePath).length, 1)

            // Advance time past the maxAgeMs, snapshot should be removed
            dateNowStub.returns(initialTime + tracker.config.maxAgeMs + 2000)
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

            const initialTime = globals.clock.Date.now()

            // First snapshot for file1 (oldest)
            const mockDocument1 = createMockDocument('content 1', file1)
            await tracker.processEdit(mockDocument1, 'content 1')
            dateNowStub.returns(initialTime + 1000)
            await clock.tickAsync(1000)

            // Second snapshot for file1
            await tracker.processEdit(mockDocument1, 'content 2')
            dateNowStub.returns(initialTime + 2000)
            await clock.tickAsync(1000)

            // First snapshot for file2
            const mockDocument2 = createMockDocument('content 3', file2)
            await tracker.processEdit(mockDocument2, 'content 3')

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
            const content = 'file content'
            const mockDocument = createMockDocument(content, file)
            await tracker.processEdit(mockDocument, content)

            const result = tracker.getFileSnapshots(file)
            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0].filePath, file)
            assert.strictEqual(result[0].content, content)
        })
    })

    describe('getSnapshotContent', function () {
        let file: string
        let snapshotContent: string
        let snapshot: FileSnapshot

        beforeEach(async function () {
            tracker = new PredictionTracker(mockExtensionContext)
            file = '/path/to/file.js'
            snapshotContent = 'snapshot content'
            const mockDocument = createMockDocument(snapshotContent, file)
            await tracker.processEdit(mockDocument, snapshotContent)

            snapshot = tracker.getFileSnapshots(file)[0]
        })

        it('should retrieve snapshot content from memory', async function () {
            const content = await tracker.getSnapshotContent(snapshot)
            assert.strictEqual(content, snapshotContent)
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
            const initialTime = globals.clock.Date.now()

            const mockDoc = createMockDocument('old content 1', filePath)
            await tracker.processEdit(mockDoc, 'old content 1')
            dateNowStub.returns(initialTime + tracker.config.debounceIntervalMs + 1000)
            await clock.tickAsync(tracker.config.debounceIntervalMs + 1000)
            await tracker.processEdit(mockDoc, 'old content 2')

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

            // Check that the snapshot content is correctly passed to the diffContextGenerator
            const snapshotContents = diffGenerateStub.args[0][2]
            assert.strictEqual(snapshotContents[0].content, 'old content 1')
            assert.strictEqual(snapshotContents[1].content, 'old content 2')
        })
    })
})
