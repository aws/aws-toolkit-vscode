/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as picker from '../../../shared/ui/picker'
import {
    createSsmDocumentFromTemplate,
    SsmDocumentTemplateQuickPickItem,
    promptUserForTemplate,
} from '../../../ssmDocument/commands/createDocumentFromTemplate'
import * as openAndSaveDocument from '../../../ssmDocument/util/util'

import * as YAML from 'yaml'

describe('createDocumentFromTemplate', async () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
        sandbox.stub(picker, 'promptUser').returns(Promise.resolve(fakeSelection))
        sandbox.stub(picker, 'verifySinglePickerOutput').returns(fakeSelectionResult)
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
        filename: 'test.command.ssm.json',
        language: 'ssm-json',
        docType: 'command',
    }

    const fakeSelection: SsmDocumentTemplateQuickPickItem[] = []
    fakeSelection.push(fakeSelectionResult)

    it('prompt users for templates', async () => {
        const res = await promptUserForTemplate()
        assert.strictEqual(res, fakeSelectionResult)
    })

    it('open and save document based on selected template', async () => {
        sandbox.stub(JSON, 'stringify').returns(fakeContent)
        sandbox.stub(YAML, 'stringify').returns(fakeContent)

        const openAndSaveStub = sandbox.stub(openAndSaveDocument, 'openAndSaveDocument')
        await createSsmDocumentFromTemplate()
        assert.strictEqual(openAndSaveStub.getCall(0).args[0], fakeContent)
        assert.strictEqual(openAndSaveStub.getCall(0).args[1], fakeSelectionResult.filename)
        assert.strictEqual(openAndSaveStub.getCall(0).args[2], fakeSelectionResult.language)
    })
})
