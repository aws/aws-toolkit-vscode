/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import * as picker from '../../../shared/ui/picker'
import {
    createSsmDocumentFromTemplate,
    SsmDocumentTemplateQuickPickItem,
} from '../../../ssmDocument/commands/createDocumentFromTemplate'
import * as ssmDocumentUtil from '../../../ssmDocument/util/util'
import * as fsUtilities from '../../../shared/filesystemUtilities'

import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('createDocumentFromTemplate', async function () {
    let mockContext: vscode.ExtensionContext
    let sandbox: sinon.SinonSandbox
    before(async function () {
        mockContext = await FakeExtensionContext.create()
    })
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    const fakeContentYaml = `---
schemaVersion: '2.2'
mainSteps: []
`

    const fakeContentJson = `{
    "schemaVersion": "2.2",
    "mainSteps": []
}`

    const fakeSelectionResult: SsmDocumentTemplateQuickPickItem = {
        label: 'test template',
        description: 'an example to test creating from template',
        filename: 'test.command.ssm.json',
        docType: 'command',
    }

    const fakeSelection: SsmDocumentTemplateQuickPickItem[] = []
    fakeSelection.push(fakeSelectionResult)

    it('open and save document based on selected template', async function () {
        sandbox.stub(picker, 'promptUser').returns(Promise.resolve(fakeSelection))
        sandbox.stub(picker, 'verifySinglePickerOutput').returns(fakeSelectionResult)
        sandbox.stub(fsUtilities, 'readFileAsString').returns(Promise.resolve(fakeContentYaml))
        sandbox.stub(ssmDocumentUtil, 'promptUserForDocumentFormat').returns(Promise.resolve('JSON'))

        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument')

        await createSsmDocumentFromTemplate(mockContext)

        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.content, fakeContentJson)
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.language, 'ssm-json')
    })
})
