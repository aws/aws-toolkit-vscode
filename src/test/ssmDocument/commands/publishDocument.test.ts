/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'

import { stringify } from 'querystring'

import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { ext } from '../../../shared/extensionGlobals'
import * as publish from '../../../ssmDocument/commands/publishDocument'
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

const mockChannel: vscode.OutputChannel = {
    name: 'channel',
    append: sinon.spy(),
    appendLine: sinon.spy(),
    clear: sinon.spy(),
    show: sinon.spy(),
    hide: sinon.spy(),
    dispose: sinon.spy(),
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

    let channel: vscode.OutputChannel
    let textDocument: vscode.TextDocument
    let apiCalled: string

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        apiCalled = ''
        channel = { ...mockChannel }
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
            })
        )

        await publish.publishSSMDocument(fakeAwsContext, fakeRegionProvider, channel)

        sinon.assert.calledOnce(wizardStub)
        assert.strictEqual(apiCalled, 'createDocument')
    })

    // it('tests calling updateDocument', async () => {
    //     const wizardStub = sandbox.stub(PublishSSMDocumentWizard.prototype, 'run').returns(
    //         Promise.resolve({
    //             PublishSsmDocAction: 'Update',
    //             name: 'testName',
    //         })
    //     )

    //     await publish.publishSSMDocument(fakeAwsContext, fakeRegionProvider, channel)

    //     sinon.assert.calledOnce(wizardStub)
    //     assert.strictEqual(apiCalled, 'updateDocument')
    // })

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
    let channel: vscode.OutputChannel
    let wizardResponse: PublishSSMDocumentWizardResponse
    let textDocument: vscode.TextDocument
    let result: SSM.CreateDocumentResult | SSM.UpdateDocumentResult
    let client: SsmDocumentClient
    let channelOutput: string[] = []

    beforeEach(async () => {
        sandbox = sinon.createSandbox()
        channelOutput = []

        wizardResponse = {
            PublishSsmDocAction: 'Update',
            name: 'test',
            documentType: 'Automation',
        }
        textDocument = { ...mockDoc }
        result = {
            DocumentDescription: {
                Name: 'testName',
            },
        }
        channel = {
            ...mockChannel,
            appendLine: sandbox.stub().callsFake(value => {
                channelOutput.push(value)
            }),
        }
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('createDocument', async () => {
        it('createDocument API returns successfully', async () => {
            client = new MockSsmDocumentClient(
                undefined,
                req => {
                    return new Promise<SSM.DeleteDocumentResult>((resolve, reject) => {
                        resolve(result)
                    })
                },
                undefined,
                undefined,
                undefined,
                req => {
                    return new Promise<SSM.CreateDocumentResult>((resolve, reject) => {
                        resolve(result)
                    })
                },
                undefined
            )

            await publish.createDocument(wizardResponse, textDocument, channel, 'us-east-1', client)

            assert.strictEqual(channelOutput.length, 4)
            assert.strictEqual(
                channelOutput[1],
                `Successfully created and uploaded Systems Manager Document '${wizardResponse.name}'`
            )
            assert.strictEqual(channelOutput[2], stringify(result.DocumentDescription))
        })

        it('createDocument API failed', async () => {
            client = new MockSsmDocumentClient(
                undefined,
                req => {
                    return new Promise<SSM.DeleteDocumentResult>((resolve, reject) => {
                        resolve(result)
                    })
                },
                undefined,
                undefined,
                undefined,
                req => {
                    return new Promise<SSM.CreateDocumentResult>((resolve, reject) => {
                        throw new Error('Create Error')
                    })
                },
                undefined
            )

            await publish.createDocument(wizardResponse, textDocument, channel, 'us-east-1', client)

            assert.strictEqual(channelOutput.length, 3)
            assert.strictEqual(
                channelOutput[1],
                `There was an error creating and uploading Systems Manager Document '${wizardResponse.name}', check logs for more information.`
            )
        })
    })

    // describe('updateDocument', async () => {
    //     it('updateDocument API returns successfully', async () => {
    //         client = new MockSsmDocumentClient(undefined, undefined, undefined, undefined, undefined, req => {
    //             return new Promise<SSM.UpdateDocumentResult>((resolve, reject) => {
    //                 resolve(result)
    //             })
    //         })
    //         await publish.updateDocument(wizardResponse, textDocument, channel, 'us-east-1', client)

    //         assert.strictEqual(channelOutput.length, 4)
    //         assert.strictEqual(channelOutput[1], `Successfully updated SSM Document '${wizardResponse.name}'`)
    //         assert.strictEqual(channelOutput[2], stringify(result.DocumentDescription))
    //     })

    //     it('updateDocument API failed', async () => {
    //         client = new MockSsmDocumentClient(undefined, undefined, undefined, undefined, undefined, req => {
    //             return new Promise<SSM.UpdateDocumentResult>((resolve, reject) => {
    //                 throw new Error('Update Error')
    //             })
    //         })

    //         await publish.updateDocument(wizardResponse, textDocument, channel, 'us-east-1', client)

    //         assert.strictEqual(channelOutput.length, 3)
    //         assert.strictEqual(
    //             channelOutput[1],
    //             `There was an error updating SSM Document '${wizardResponse.name}', check logs for more information.`
    //         )
    //     })
    // })
})
