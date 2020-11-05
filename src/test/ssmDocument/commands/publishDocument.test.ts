/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import * as publish from '../../../ssmDocument/commands/publishDocument'
import * as ssmUtils from '../../../ssmDocument/util/util'
import {
    PublishSSMDocumentWizardResponse,
    PublishSSMDocumentWizard,
} from '../../../ssmDocument/wizards/publishDocumentWizard'
import { MockSsmDocumentClient } from '../../shared/clients/mockClients'
import * as picker from '../../../shared/ui/picker'
import { FakeAwsContext, FakeRegionProvider } from '../../utilities/fakeAwsContext'

let sandbox: sinon.SinonSandbox

const mockUriOne: vscode.Uri = {
    authority: 'MockAuthorityOne',
    fragment: 'MockFragmentOne',
    fsPath: 'MockFSPathOne',
    query: 'MockQueryOne',
    path: 'MockPathOne',
    scheme: 'MockSchemeOne',
    with: () => {
        return mockUriOne
    },
    toJSON: sinon.spy(),
}

const mockDoc: vscode.TextDocument = {
    eol: 1,
    fileName: 'MockFileNameOne',
    isClosed: false,
    isDirty: false,
    isUntitled: false,
    languageId: 'ssm-json',
    lineCount: 0,
    uri: mockUriOne,
    version: 0,
    getText: () => {
        return 'MockDocumentTextOne'
    },
    getWordRangeAtPosition: sinon.spy(),
    lineAt: sinon.spy(),
    offsetAt: sinon.spy(),
    positionAt: sinon.spy(),
    save: sinon.spy(),
    validatePosition: sinon.spy(),
    validateRange: sinon.spy(),
}

describe('publishSSMDocument', async () => {
    let sandbox = sinon.createSandbox()
    const fakeAwsContext = new FakeAwsContext()
    const fakeRegionProvider = new FakeRegionProvider()

    const fakeRegions = [
        {
            label: 'us-east-1',
            description: 'us-east-1',
        },
    ]

    const fakeRegion = {
        label: 'us-east-1',
        description: 'us-east-1',
    }

    let textDocument: vscode.TextDocument
    let apiCalled: string

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        apiCalled = ''
        textDocument = { ...mockDoc }
        sandbox.stub(vscode.window, 'activeTextEditor').value({
            document: textDocument,
        })
        sandbox
            .stub(picker, 'promptUser')
            .onFirstCall()
            .returns(Promise.resolve(fakeRegions))
        sandbox
            .stub(picker, 'verifySinglePickerOutput')
            .onFirstCall()
            .returns(fakeRegion)
        initializeClientBuilders()
    })

    afterEach(async () => {
        sandbox.restore()
    })

    it('tests calling createDocument', async () => {
        const wizardStub = sandbox.stub(PublishSSMDocumentWizard.prototype, 'run').returns(
            Promise.resolve({
                PublishSsmDocAction: 'Create',
                name: 'testName',
                documentType: 'Command',
                region: '',
            })
        )

        await publish.publishSSMDocument(fakeAwsContext, fakeRegionProvider)

        sinon.assert.calledOnce(wizardStub)
        assert.strictEqual(apiCalled, 'createDocument')
    })

    it('tests calling updateDocument', async () => {
        const wizardStub = sandbox.stub(PublishSSMDocumentWizard.prototype, 'run').returns(
            Promise.resolve({
                PublishSsmDocAction: 'Update',
                name: 'testName',
                region: '',
            })
        )
        sandbox.stub(ssmUtils, 'showConfirmationMessage').returns(Promise.resolve(false))
        await publish.publishSSMDocument(fakeAwsContext, fakeRegionProvider)

        sinon.assert.calledOnce(wizardStub)
        assert.strictEqual(apiCalled, 'updateDocument')
    })

    function initializeClientBuilders(): void {
        const ssmDocumentClient = {
            createDocument: (request: SSM.CreateDocumentRequest) => {
                apiCalled = 'createDocument'
                return {} as SSM.CreateDocumentResult
            },
            updateDocument: (request: SSM.UpdateDocumentRequest) => {
                apiCalled = 'updateDocument'
                return {} as SSM.UpdateDocumentResult
            },
        }

        const clientBuilder = {
            createSsmClient: sandbox.stub().returns(ssmDocumentClient),
        }

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    }
})

describe('publishDocument', async () => {
    let wizardResponse: PublishSSMDocumentWizardResponse
    let textDocument: vscode.TextDocument
    let result: SSM.CreateDocumentResult | SSM.UpdateDocumentResult
    let client: SsmDocumentClient
    let fakeCreateRequest: SSM.CreateDocumentRequest = {
        Content: 'MockDocumentTextOne',
        DocumentFormat: 'JSON',
        DocumentType: 'Automation',
        Name: 'test',
    }
    let fakeUpdateRequest: SSM.UpdateDocumentRequest = {
        Content: 'MockDocumentTextOne',
        DocumentFormat: 'JSON',
        DocumentVersion: '$LATEST',
        Name: 'test',
    }

    beforeEach(async () => {
        sandbox = sinon.createSandbox()

        wizardResponse = {
            PublishSsmDocAction: 'Update',
            name: 'test',
            documentType: 'Automation',
            region: '',
        }
        textDocument = { ...mockDoc }
        result = {
            DocumentDescription: {
                Name: 'testName',
            },
        }
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('createDocument', async () => {
        it('createDocument API returns successfully', async () => {
            client = new MockSsmDocumentClient(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                req => {
                    return new Promise<SSM.CreateDocumentResult>((resolve, reject) => {
                        resolve(result)
                    })
                },
                undefined,
                undefined
            )
            const createSpy = sandbox.spy(client, 'createDocument')
            await publish.createDocument(wizardResponse, textDocument, client)
            assert(createSpy.calledOnce)
            assert(createSpy.calledWith(fakeCreateRequest))
        })

        it('createDocument API failed', async () => {
            client = new MockSsmDocumentClient(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                req => {
                    return new Promise<SSM.CreateDocumentResult>((resolve, reject) => {
                        throw new Error('Create Error')
                    })
                },
                undefined,
                undefined
            )
            const createErrorSpy = sandbox.spy(vscode.window, 'showErrorMessage')
            await publish.createDocument(wizardResponse, textDocument, client)
            assert(createErrorSpy.calledOnce)
            assert(
                createErrorSpy.getCall(0).args[0],
                "Failed to create Systems Manager Document 'test'. \nCreate Error"
            )
        })
    })

    describe('updateDocument', async () => {
        it('updateDocument API returns successfully', async () => {
            client = new MockSsmDocumentClient(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                req => {
                    return new Promise<SSM.UpdateDocumentResult>((resolve, reject) => {
                        resolve(result)
                    })
                }
            )
            const updateSpy = sandbox.spy(client, 'updateDocument')
            sandbox.stub(ssmUtils, 'showConfirmationMessage').returns(Promise.resolve(false))
            await publish.updateDocument(wizardResponse, textDocument, client)
            assert(updateSpy.calledOnce)
            assert(updateSpy.calledWith(fakeUpdateRequest))
        })

        it('updateDocument API failed', async () => {
            client = new MockSsmDocumentClient(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                req => {
                    return new Promise<SSM.UpdateDocumentResult>((resolve, reject) => {
                        throw new Error('Update Error')
                    })
                }
            )
            const updateErrorSpy = sandbox.spy(vscode.window, 'showErrorMessage')
            sandbox.stub(ssmUtils, 'showConfirmationMessage').returns(Promise.resolve(false))
            await publish.updateDocument(wizardResponse, textDocument, client)
            assert(updateErrorSpy.calledOnce)
            assert(
                updateErrorSpy.getCall(0).args[0],
                "Failed to update Systems Manager Document 'test'. \nUpdate Error"
            )
        })
    })
})
