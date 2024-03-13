/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import assert from 'assert'
import { LineTracker } from '../../../codewhisperer/tracker/lineTracker'
import { Disposable, TextEditor, Position, Range, Selection } from 'vscode'
import { openATextEditorWithText } from '../../testUtil'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

describe('LineTracker class', function () {
    let sut: LineTracker
    let disposable: Disposable
    let editor: TextEditor
    let sandbox: sinon.SinonSandbox
    let counts = {
        editor: 0,
        selection: 0,
        content: 0,
    }

    beforeEach(async function () {
        sut = new LineTracker()
        sandbox = sinon.createSandbox()
        counts = {
            editor: 0,
            selection: 0,
            content: 0,
        }
        disposable = sut.onDidChangeActiveLines(e => {
            if (e.reason === 'content') {
                counts.content++
            } else if (e.reason === 'selection') {
                counts.selection++
            } else if (e.reason === 'editor') {
                counts.editor++
            }
        })

        sandbox.stub(AuthUtil.instance, 'isConnected').returns(true)
        sandbox.stub(AuthUtil.instance, 'isConnectionExpired').returns(false)
    })

    afterEach(function () {
        disposable.dispose()
        sut.dispose()
        sandbox.restore()
    })

    function assertEmptyCounts() {
        assert.deepStrictEqual(counts, {
            editor: 0,
            selection: 0,
            content: 0,
        })
    }
    it('ready will emit onReady event', async function () {
        let messageReceived = 0
        disposable = sut.onReady(_ => {
            messageReceived++
        })

        assert.strictEqual(sut.isReady, false)
        sut.ready()

        await waitUntil(
            async () => {
                if (messageReceived !== 0) {
                    return
                }
            },
            { interval: 1000 }
        )

        assert.strictEqual(sut.isReady, true)
        assert.strictEqual(messageReceived, 1)
    })

    describe('onContentChanged', function () {
        it('should fire lineChangedEvent and set current line selection', async function () {
            editor = await openATextEditorWithText('\n\n\n\n\n', 'foo.py', undefined, { preview: false })
            editor.selection = new Selection(new Position(5, 0), new Position(5, 0))
            assertEmptyCounts()

            await sut.onContentChanged({
                document: editor.document,
                contentChanges: [{ text: 'a', range: new Range(0, 0, 0, 0), rangeOffset: 0, rangeLength: 0 }],
                reason: undefined,
            })

            assert.deepStrictEqual(counts, { ...counts, content: 1 })
            assert.deepStrictEqual(sut.selections, [
                {
                    anchor: 5,
                    active: 5,
                },
            ])
        })
    })

    describe('onTextEditorSelectionChanged', function () {
        it('should fire lineChangedEvent if selection changes and set current line selection', async function () {
            editor = await openATextEditorWithText('\n\n\n\n\n', 'foo.py', undefined, { preview: false })
            editor.selection = new Selection(new Position(3, 0), new Position(3, 0))
            assertEmptyCounts()
            assert.ok(sut.selections === undefined)

            await sut.onTextEditorSelectionChanged({
                textEditor: editor,
                selections: [new Selection(new Position(3, 0), new Position(3, 0))],
                kind: undefined,
            })

            assert.deepStrictEqual(counts, { ...counts, selection: 1 })
            assert.deepStrictEqual(sut.selections, [
                {
                    anchor: 3,
                    active: 3,
                },
            ])

            // if selection is included in the existing selections, won't emit an event
            await sut.onTextEditorSelectionChanged({
                textEditor: editor,
                selections: [new Selection(new Position(3, 0), new Position(3, 0))],
                kind: undefined,
            })

            assert.deepStrictEqual(counts, { ...counts, selection: 1 })
            assert.deepStrictEqual(sut.selections, [
                {
                    anchor: 3,
                    active: 3,
                },
            ])
        })

        it('should not fire lineChangedEvent if uri scheme is debug || output', async function () {
            // if the editor is not a text editor, won't emit an event and selection will be set to undefined
            async function assertLineChanged(schema: string) {
                const anotherEditor = await openATextEditorWithText('', 'bar.log', undefined, { preview: false })
                const uri = anotherEditor.document.uri
                sandbox.stub(uri, 'scheme').get(() => schema)

                await sut.onTextEditorSelectionChanged({
                    textEditor: anotherEditor,
                    selections: [new Selection(new Position(3, 0), new Position(3, 0))],
                    kind: undefined,
                })

                assert.deepStrictEqual(counts, { ...counts })
                assert.deepStrictEqual(sut.selections, undefined)
            }

            await assertLineChanged('debug')
            await assertLineChanged('output')
        })
    })

    describe('onActiveTextEditorChanged', function () {
        it('shoudl fire lineChangedEvent', async function () {
            editor = await openATextEditorWithText('\n\n\n\n\n', 'foo.py', undefined, { preview: false })
            editor.selection = new Selection(new Position(1, 0), new Position(1, 0))
            assertEmptyCounts()

            await sut.onActiveTextEditorChanged(editor)

            assert.deepStrictEqual(counts, { ...counts, editor: 1 })
            assert.deepStrictEqual(sut.selections, [
                {
                    anchor: 1,
                    active: 1,
                },
            ])

            editor.selection = new Selection(new Position(2, 0), new Position(2, 0))
            await sut.onActiveTextEditorChanged(editor)

            assert.deepStrictEqual(counts, { ...counts, editor: 1 })
        })
    })
})
