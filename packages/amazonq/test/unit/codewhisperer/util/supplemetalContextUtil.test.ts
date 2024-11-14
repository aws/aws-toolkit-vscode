/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as crossFile from 'aws-core-vscode/codewhisperer'
import { TestFolder } from 'aws-core-vscode/test'
import { FeatureConfigProvider } from 'aws-core-vscode/codewhisperer'
import { toTextEditor } from 'aws-core-vscode/test'

describe('supplementalContextUtil', function () {
    let testFolder: TestFolder

    const fakeCancellationToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: sinon.spy(),
    }

    beforeEach(async function () {
        testFolder = await TestFolder.create()
        sinon.stub(FeatureConfigProvider.instance, 'getProjectContextGroup').alwaysReturned('control')
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('fetchSupplementalContext', function () {
        describe('openTabsContext', function () {
            it('opentabContext should include chunks if non empty', async function () {
                sinon.stub(FeatureConfigProvider.instance, 'getProjectContextGroup').alwaysReturned('control')

                await toTextEditor('class Foo', 'Foo.java', testFolder.path, { preview: false })
                await toTextEditor('class Bar', 'Bar.java', testFolder.path, { preview: false })
                await toTextEditor('class Baz', 'Baz.java', testFolder.path, { preview: false })

                const editor = await toTextEditor('public class Foo {}', 'Query.java', testFolder.path, {
                    preview: false,
                })

                const actual = await crossFile.fetchSupplementalContext(editor, fakeCancellationToken)
                assert.ok(actual?.supplementalContextItems.length === 3)
            })

            it('opentabsContext should filter out empty chunks', async function () {
                sinon.stub(FeatureConfigProvider.instance, 'getProjectContextGroup').alwaysReturned('control')

                // open 3 files as supplemental context candidate files but none of them have contents
                await toTextEditor('', 'Foo.java', testFolder.path, { preview: false })
                await toTextEditor('', 'Bar.java', testFolder.path, { preview: false })
                await toTextEditor('', 'Baz.java', testFolder.path, { preview: false })

                const editor = await toTextEditor('public class Foo {}', 'Query.java', testFolder.path, {
                    preview: false,
                })

                const actual = await crossFile.fetchSupplementalContext(editor, fakeCancellationToken)
                assert.ok(actual?.supplementalContextItems.length === 0)
            })
        })
    })
})
