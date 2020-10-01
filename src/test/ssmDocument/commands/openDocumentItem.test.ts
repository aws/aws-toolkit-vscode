/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { openDocumentItem } from '../../../ssmDocument/commands/openDocumentItem'
import { DocumentItemNode } from '../../../ssmDocument/explorer/documentItemNode'

import * as picker from '../../../shared/ui/picker'
import { MockSsmDocumentClient } from '../../shared/clients/mockClients'
import { FakeAwsContext } from '../../utilities/fakeAwsContext'

describe('openDocumentItem', async () => {
    let sandbox: sinon.SinonSandbox
    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    const rawContent: SSM.Types.GetDocumentResult = {
        DocumentFormat: 'json',
        DocumentType: 'Command',
        Name: 'testDocument',
        Content: `{
            "schemaVersion": "2.2",
            "mainSteps": [

            ]
        }`,
    }

    const fakeDoc: SSM.Types.DocumentIdentifier = {
        Name: 'testDocument',
        DocumentFormat: 'json',
        DocumentType: 'Command',
        Owner: 'Amazon',
    }

    const fakeAwsContext = new FakeAwsContext()

    const fakeRegion = 'us-east-1'

    const fakeFormatSelection = [
        {
            label: 'JSON',
            description: 'Open document in JSON format',
        },
    ]

    const fakeFormatSelectionResult = {
        label: 'JSON',
        description: 'Open document with format JSON',
    }

    it('create DocumentItemNode and openDocumentItem functionality', async () => {
        sandbox.stub(vscode.window, 'showSaveDialog').returns(Promise.resolve(vscode.Uri.file('test')))
        sandbox
            .stub(picker, 'promptUser')
            .onFirstCall()
            .returns(Promise.resolve(fakeFormatSelection))
        sandbox
            .stub(picker, 'verifySinglePickerOutput')
            .onFirstCall()
            .returns(fakeFormatSelectionResult)

        const documentNode = generateDocumentItemNode()
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument')
        await openDocumentItem(documentNode, fakeAwsContext)
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.content, rawContent.Content)
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.language, 'ssm-json')
    })

    function generateDocumentItemNode(): DocumentItemNode {
        const ssmDocumentClient = new MockSsmDocumentClient()
        sandbox.stub(ssmDocumentClient, 'getDocument').returns(Promise.resolve(rawContent))

        return new DocumentItemNode(fakeDoc, ssmDocumentClient, fakeRegion)
    }
})
