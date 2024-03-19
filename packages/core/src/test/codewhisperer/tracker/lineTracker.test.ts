/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LineSelection, LineTracker } from '../../../codewhisperer/tracker/lineTracker'
import sinon from 'sinon'
import { Disposable, TextEditor, Position, Range, Selection } from 'vscode'
import { openATextEditorWithText } from '../../testUtil'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import assert from 'assert'
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
    it.skip('ready will emit onReady event', async function () {
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

    describe('includes', function () {
        // util function to help set up LineTracker.selections
        async function setEditorSelection(selections: LineSelection[]): Promise<TextEditor> {
            const editor = await openATextEditorWithText('\n\n\n\n\n\n\n\n\n\n', 'foo.py', undefined, {
                preview: false,
            })

            const vscodeSelections = selections.map(s => {
                return new Selection(new Position(s.anchor, 0), new Position(s.active, 0))
            })

            await sut.onTextEditorSelectionChanged({
                textEditor: editor,
                selections: vscodeSelections,
                kind: undefined,
            })

            assert.deepStrictEqual(sut.selections, selections)
            return editor
        }

        it('exact match when array of selections are provided', async function () {
            const selections = [
                {
                    anchor: 1,
                    active: 1,
                },
                {
                    anchor: 3,
                    active: 3,
                },
            ]

            editor = await setEditorSelection(selections)
            assert.deepStrictEqual(sut.selections, selections)

            let actual = sut.includes([
                { active: 1, anchor: 1 },
                { active: 3, anchor: 3 },
            ])
            assert.strictEqual(actual, true)

            actual = sut.includes([
                { active: 2, anchor: 2 },
                { active: 4, anchor: 4 },
            ])
            assert.strictEqual(actual, false)

            // both active && anchor have to be the same
            actual = sut.includes([
                { active: 1, anchor: 0 },
                { active: 3, anchor: 0 },
            ])
            assert.strictEqual(actual, false)

            // different length would simply return false
            actual = sut.includes([
                { active: 1, anchor: 1 },
                { active: 3, anchor: 3 },
                { active: 5, anchor: 5 },
            ])
            assert.strictEqual(actual, false)
        })

        it('match active line if line number and activeOnly option are provided', async function () {
            const selections = [
                {
                    anchor: 1,
                    active: 1,
                },
                {
                    anchor: 3,
                    active: 3,
                },
            ]

            editor = await setEditorSelection(selections)
            assert.deepStrictEqual(sut.selections, selections)

            let actual = sut.includes(1, { activeOnly: true })
            assert.strictEqual(actual, true)

            actual = sut.includes(2, { activeOnly: true })
            assert.strictEqual(actual, false)
        })

        it('range match if line number and activeOnly is set to false', async function () {
            const selections = [
                {
                    anchor: 0,
                    active: 2,
                },
                {
                    anchor: 4,
                    active: 6,
                },
            ]

            editor = await setEditorSelection(selections)
            assert.deepStrictEqual(sut.selections, selections)

            for (const line of [0, 1, 2]) {
                const actual = sut.includes(line, { activeOnly: false })
                assert.strictEqual(actual, true)
            }

            for (const line of [4, 5, 6]) {
                const actual = sut.includes(line, { activeOnly: false })
                assert.strictEqual(actual, true)
            }

            let actual = sut.includes(3, { activeOnly: false })
            assert.strictEqual(actual, false)

            actual = sut.includes(7, { activeOnly: false })
            assert.strictEqual(actual, false)
        })
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
