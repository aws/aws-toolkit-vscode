/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import * as publish from '../../../ssmDocument/commands/publishDocument'
import * as ssmUtils from '../../../ssmDocument/util/util'
import {
    PublishSSMDocumentAction,
    PublishSSMDocumentWizardResponse,
} from '../../../ssmDocument/wizards/publishDocumentWizard'
import { closeAllEditors } from '../../testUtil'

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

    before(async function () {
        textDocument = await vscode.workspace.openTextDocument({ content: 'foo', language: 'ssm-json' })
        await vscode.window.showTextDocument(textDocument)
    })

    after(async function () {
        await closeAllEditors()
    })

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
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('createDocument', async function () {
        it('createDocument API returns successfully', async function () {
            wizardResponse = {
                action: PublishSSMDocumentAction.QuickCreate,
                name: 'test',
                documentType: 'Automation',
                region: '',
            }

            const client = {
                async createDocument() {
                    return result
                },
            } as unknown as SsmDocumentClient

            const createSpy = sinon.spy(client, 'createDocument')
            await publish.createDocument(wizardResponse, textDocument, client)
            assert(createSpy.calledOnce)
            assert(createSpy.calledWith(fakeCreateRequest))
        })

        it('createDocument API failed', async function () {
            const client = {
                async createDocument() {
                    throw new Error('Create Error')
                },
            } as unknown as SsmDocumentClient

            const createErrorSpy = sinon.spy(vscode.window, 'showErrorMessage')
            await publish.createDocument(wizardResponse, textDocument, client)
            assert(createErrorSpy.calledOnce)
            assert(
                createErrorSpy.getCall(0).args[0],
                "Failed to create Systems Manager Document 'test'. \nCreate Error"
            )
        })
    })

    describe('updateDocument', async function () {
        it('updateDocument API returns successfully', async function () {
            const client = {
                async updateDocument() {
                    return result
                },
            } as unknown as SsmDocumentClient

            const updateSpy = sinon.spy(client, 'updateDocument')
            sinon.stub(ssmUtils, 'showConfirmationMessage').returns(Promise.resolve(false))
            await publish.updateDocument(wizardResponse, textDocument, client)
            assert(updateSpy.calledOnce)
            assert(updateSpy.calledWith(fakeUpdateRequest))
        })

        it('updateDocument API failed', async function () {
            const client = {
                async updateDocument() {
                    throw new Error('Update Error')
                },
            } as unknown as SsmDocumentClient

            const updateErrorSpy = sinon.spy(vscode.window, 'showErrorMessage')
            sinon.stub(ssmUtils, 'showConfirmationMessage').returns(Promise.resolve(false))
            await publish.updateDocument(wizardResponse, textDocument, client)
            assert(updateErrorSpy.calledOnce)
            assert(
                updateErrorSpy.getCall(0).args[0],
                "Failed to update Systems Manager Document 'test'. \nUpdate Error"
            )
        })
    })
})
