/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import * as picker from '../../../shared/ui/picker'
import {
    createSsmDocumentFromTemplate,
    SsmDocumentTemplateQuickPickItem,
} from '../../../ssmDocument/commands/createDocumentFromTemplate'
import * as ssmDocumentUtil from '../../../ssmDocument/util/util'
import * as fsUtilities from '../../../shared/filesystemUtilities'

import * as YAML from 'yaml'
import { FakeExtensionContext } from '../../fakeExtensionContext'

describe('createDocumentFromTemplate', async () => {
    let mockContext: vscode.ExtensionContext
    let sandbox: sinon.SinonSandbox
    before(() => {
        mockContext = new FakeExtensionContext()
    })
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    const fakeContent = `{
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

    it('open and save document based on selected template', async () => {
        sandbox.stub(picker, 'promptUser').returns(Promise.resolve(fakeSelection))
        sandbox.stub(picker, 'verifySinglePickerOutput').returns(fakeSelectionResult)
        sandbox.stub(fsUtilities, 'readFileAsString').returns(Promise.resolve(fakeContent))
        sandbox.stub(ssmDocumentUtil, 'promptUserForDocumentFormat').returns(Promise.resolve('JSON'))
        sandbox.stub(JSON, 'stringify').returns(fakeContent)
        sandbox.stub(YAML, 'stringify').returns(fakeContent)

        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument')

        await createSsmDocumentFromTemplate(mockContext)

        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.content, fakeContent)
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.language, 'ssm-json')
    })
})
