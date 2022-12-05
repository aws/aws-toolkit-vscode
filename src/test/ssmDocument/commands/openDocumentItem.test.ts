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
import { DefaultSsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { stub } from '../../utilities/stubber'
import { createTestAuth } from '../../testUtil'
import { Auth } from '../../../credentials/auth'

describe('openDocumentItem', async function () {
    afterEach(function () {
        sinon.restore()
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

    it('create DocumentItemNode and openDocumentItem functionality', async function () {
        const auth = await createTestAuth()

        sinon.stub(vscode.window, 'showSaveDialog').returns(Promise.resolve(vscode.Uri.file('test')))
        sinon.stub(picker, 'promptUser').onFirstCall().returns(Promise.resolve(fakeFormatSelection))
        sinon.stub(picker, 'verifySinglePickerOutput').onFirstCall().returns(fakeFormatSelectionResult)

        const documentNode = generateDocumentItemNode(auth)
        const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument')
        await openDocumentItem(documentNode, 'json')
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.content, rawContent.Content)
        assert.strictEqual(openTextDocumentStub.getCall(0).args[0]?.language, 'ssm-json')
    })

    function generateDocumentItemNode(auth: Auth): DocumentItemNode {
        const fakeDoc: SSM.Types.DocumentIdentifier = {
            Name: 'testDocument',
            DocumentFormat: 'json',
            DocumentType: 'Command',
            Owner: auth.getAccountId(),
        }

        const client = stub(DefaultSsmDocumentClient, { regionCode: fakeRegion })
        client.getDocument.resolves(rawContent)

        return new DocumentItemNode(fakeDoc, client, fakeRegion)
    }
})
