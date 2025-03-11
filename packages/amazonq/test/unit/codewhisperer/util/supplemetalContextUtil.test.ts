/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as FakeTimers from '@sinonjs/fake-timers'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as crossFile from 'aws-core-vscode/codewhisperer'
import { TestFolder, assertTabCount, installFakeClock } from 'aws-core-vscode/test'
import { CodeWhispererSupplementalContext, FeatureConfigProvider } from 'aws-core-vscode/codewhisperer'
import { toTextEditor } from 'aws-core-vscode/test'
import { LspController } from 'aws-core-vscode/amazonq'

describe('supplementalContextUtil', function () {
    let testFolder: TestFolder
    let clock: FakeTimers.InstalledClock

    const fakeCancellationToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: sinon.spy(),
    }

    before(function () {
        clock = installFakeClock()
    })

    after(function () {
        clock.uninstall()
    })

    beforeEach(async function () {
        testFolder = await TestFolder.create()
        sinon.stub(FeatureConfigProvider.instance, 'getProjectContextGroup').returns('control')
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('fetchSupplementalContext', function () {
        describe('openTabsContext', function () {
            it('opentabContext should include chunks if non empty', async function () {
                sinon
                    .stub(LspController.instance, 'queryInlineProjectContext')
                    .withArgs(sinon.match.any, sinon.match.any, 'codemap')
                    .resolves([
                        {
                            content: 'foo',
                            score: 0,
                            filePath: 'q-inline',
                        },
                    ])
                await toTextEditor('class Foo', 'Foo.java', testFolder.path, { preview: false })
                await toTextEditor('class Bar', 'Bar.java', testFolder.path, { preview: false })
                await toTextEditor('class Baz', 'Baz.java', testFolder.path, { preview: false })

                const editor = await toTextEditor('public class Foo {}', 'Query.java', testFolder.path, {
                    preview: false,
                })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContext(editor, fakeCancellationToken)
                assert.ok(actual?.supplementalContextItems.length === 4)
            })

            it('opentabsContext should filter out empty chunks', async function () {
                // open 3 files as supplemental context candidate files but none of them have contents
                await toTextEditor('', 'Foo.java', testFolder.path, { preview: false })
                await toTextEditor('', 'Bar.java', testFolder.path, { preview: false })
                await toTextEditor('', 'Baz.java', testFolder.path, { preview: false })

                const editor = await toTextEditor('public class Foo {}', 'Query.java', testFolder.path, {
                    preview: false,
                })

                await assertTabCount(4)

                const actual = await crossFile.fetchSupplementalContext(editor, fakeCancellationToken)
                assert.ok(actual?.supplementalContextItems.length === 0)
            })
        })
    })

    describe('truncation', function () {
        function repeatString(s: string, n: number): string {
            let output = ''
            for (let i = 0; i < n; i++) {
                output += s
            }

            return output
        }

        it('truncation context should make context length per item lte 10240 cap', function () {
            const chunkA: crossFile.CodeWhispererSupplementalContextItem = {
                content: repeatString('a\n', 4000),
                filePath: 'a.java',
                score: 0,
            }
            const chunkB: crossFile.CodeWhispererSupplementalContextItem = {
                content: repeatString('b\n', 6000),
                filePath: 'b.java',
                score: 1,
            }
            const chunkC: crossFile.CodeWhispererSupplementalContextItem = {
                content: repeatString('c\n', 1000),
                filePath: 'c.java',
                score: 2,
            }
            const chunkD: crossFile.CodeWhispererSupplementalContextItem = {
                content: repeatString('d\n', 1500),
                filePath: 'd.java',
                score: 3,
            }

            assert.strictEqual(chunkA.content.length, 8000)
            assert.strictEqual(chunkB.content.length, 12000)
            assert.strictEqual(chunkC.content.length, 2000)
            assert.strictEqual(chunkD.content.length, 3000)
            assert.strictEqual(
                chunkA.content.length + chunkB.content.length + chunkC.content.length + chunkD.content.length,
                25000
            )

            const supplementalContext: CodeWhispererSupplementalContext = {
                isUtg: false,
                isProcessTimeout: false,
                supplementalContextItems: [chunkA, chunkB, chunkC, chunkD],
                contentsLength: 25000,
                latency: 0,
                strategy: 'codemap',
            }

            const actual = crossFile.truncateSuppelementalContext(supplementalContext)
            assert.strictEqual(actual.supplementalContextItems.length, 3)
            assert.strictEqual(actual.supplementalContextItems[0].content.length, 8000)
            assert.strictEqual(actual.supplementalContextItems[1].content.length, 10240)
            assert.strictEqual(actual.supplementalContextItems[2].content.length, 2000)

            assert.strictEqual(actual.contentsLength, 20240)
            assert.strictEqual(actual.strategy, 'codemap')
        })
    })
})
