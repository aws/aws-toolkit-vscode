/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { DefaultSsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import * as publish from '../../../ssmDocument/commands/publishDocument'
import * as ssmUtils from '../../../ssmDocument/util/util'
import {
    PublishSSMDocumentAction,
    PublishSSMDocumentWizardResponse,
} from '../../../ssmDocument/wizards/publishDocumentWizard'
import { closeAllEditors } from '../../testUtil'
import { stub } from '../../utilities/stubber'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'

describe('publishDocument', async function () {
    let wizardResponse: PublishSSMDocumentWizardResponse
    let textDocument: vscode.TextDocument
    let result: SSM.CreateDocumentResult | SSM.UpdateDocumentResult

    const fakeCreateRequest: SSM.CreateDocumentRequest = {
        Content: 'foo',
        DocumentFormat: 'JSON',
        DocumentType: 'Automation',
        Name: 'test',
    }
    const fakeUpdateRequest: SSM.UpdateDocumentRequest = {
        Content: 'foo',
        DocumentFormat: 'JSON',
        DocumentVersion: '$LATEST',
        Name: 'test',
    }

    beforeEach(async function () {
        wizardResponse = {
            action: PublishSSMDocumentAction.QuickUpdate,
            name: 'test',
            documentType: 'Automation',
            region: '',
        }
        result = {
            DocumentDescription: {
                Name: 'testName',
            },
        }
        textDocument = await vscode.workspace.openTextDocument({ content: 'foo', language: 'ssm-json' })
    })

    afterEach(async function () {
        sinon.restore()
        await closeAllEditors()
    })

    describe('createDocument', async function () {
        it('createDocument API returns successfully', async function () {
            wizardResponse = {
                action: PublishSSMDocumentAction.QuickCreate,
                name: 'test',
                documentType: 'Automation',
                region: '',
            }

            const client = stub(DefaultSsmDocumentClient, { regionCode: 'region-1' })
            client.createDocument.resolves(result)

            await publish.createDocument(wizardResponse, textDocument, client)

            assert(client.createDocument.calledOnce)
            assert.deepStrictEqual(client.createDocument.args, [[fakeCreateRequest]])
        })

        it('createDocument API failed', async function () {
            const client = stub(DefaultSsmDocumentClient, { regionCode: 'region-1' })
            client.createDocument.rejects(new Error('Create Error'))

            await publish.createDocument(wizardResponse, textDocument, client)
            const errorMessage = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Error)[0]
            assert.ok(errorMessage)
            errorMessage.assertMessage("Failed to create Systems Manager Document 'test'. \nCreate Error")
        })
    })

    describe('updateDocument', async function () {
        it('updateDocument API returns successfully', async function () {
            const client = stub(DefaultSsmDocumentClient, { regionCode: 'region-1' })
            client.updateDocument.resolves(result)

            sinon.stub(ssmUtils, 'showConfirmationMessage').resolves(false)
            await publish.updateDocument(wizardResponse, textDocument, client)

            assert(client.updateDocument.calledOnce)
            assert.deepStrictEqual(client.updateDocument.args, [[fakeUpdateRequest]])
        })

        it('updateDocument API failed', async function () {
            const client = stub(DefaultSsmDocumentClient, { regionCode: 'region-1' })
            client.updateDocument.rejects(new Error('Update Error'))

            sinon.stub(ssmUtils, 'showConfirmationMessage').resolves(false)
            await publish.updateDocument(wizardResponse, textDocument, client)
            const errorMessage = getTestWindow().shownMessages.filter(m => m.severity === SeverityLevel.Error)[0]
            assert.ok(errorMessage)
            errorMessage.assertMessage("Failed to update Systems Manager Document 'test'. \nUpdate Error")
        })
    })
})
