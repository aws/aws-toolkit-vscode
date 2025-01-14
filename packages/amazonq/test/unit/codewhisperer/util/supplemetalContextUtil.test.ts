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
import { FeatureConfigProvider } from 'aws-core-vscode/codewhisperer'
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
})
