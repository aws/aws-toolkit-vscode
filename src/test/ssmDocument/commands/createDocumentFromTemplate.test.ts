/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as sinon from 'sinon'
import { createSsmDocumentFromTemplate, CreateSSMDocumentFromTemplateContext, SSMDocument } from '../../../ssmDocument/commands/createDocumentFromTemplate'
import * as fsUtilities from '../../../shared/filesystemUtilities'

import * as YAML from 'yaml'
import { FakeExtensionContext } from '../../fakeExtensionContext'
import { MockPrompter } from '../../shared/wizards/wizardFramework'
import { Prompter } from '../../../shared/ui/prompter'

describe('createDocumentFromTemplate', async function () {
    let mockContext: vscode.ExtensionContext
    let sandbox: sinon.SinonSandbox
    before(function () {
        mockContext = new FakeExtensionContext()
    })
    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    const fakeContent = `{
        "schemaVersion": "2.2",
        "mainSteps": []
    }`

    const fakeSelectionResult: SSMDocument = {
        templateName: 'test template',
        filename: 'test.command.ssm.json',
        docType: 'command',
    }

    class FakeWizardContext implements CreateSSMDocumentFromTemplateContext {
        public createDocumentFormatPrompter(formats: string[]): Prompter<string> {
            return new MockPrompter('JSON')
        }
        public createDocumentTemplatePrompter(): Prompter<SSMDocument> {
            return new MockPrompter(fakeSelectionResult)
        }
    }

    it('open and save document based on selected template', async function () {
        sandbox.stub(fsUtilities, 'readFileAsString').returns(Promise.resolve(fakeContent))
        sandbox.stub(JSON, 'stringify').returns(fakeContent)
        sandbox.stub(YAML, 'stringify').returns(fakeContent)

        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument')

        await createSsmDocumentFromTemplate(mockContext, new FakeWizardContext())

        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.content, fakeContent)
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.language, 'ssm-json')
    })
})
