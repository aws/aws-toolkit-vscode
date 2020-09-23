/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { DocumentItemNode } from '../../../ssmDocument/explorer/documentItemNode'
import { executeDocument } from '../../../ssmDocument/commands/executeDocument'
import { mock } from '../../utilities/mockito'
import { SSM } from 'aws-sdk'
import { SsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'

describe('executeDocument', async () => {
    let sandbox: sinon.SinonSandbox
    let node: DocumentItemNode
    let fakeName: string = 'testDocument'
    let ssmClient: SsmDocumentClient

    const fakeDoc: SSM.Types.DocumentIdentifier = {
        Name: fakeName,
        DocumentFormat: 'json',
        DocumentType: 'Automation',
        Owner: 'Amazon',
    }

    let fakeRegion: string = 'us-east-1'
    let fakeScheme: string = 'https'
    let fakeAuthority: string = 'console.aws.amazon.com'
    let fakePath: string = '/systems-manager/automation/execute/'
    let fakeQuery: string = 'region='

    beforeEach(() => {
        ssmClient = mock()
        node = new DocumentItemNode(fakeDoc, ssmClient, fakeRegion)
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('confirms Uri is correct', async () => {
        const executeDocumentStub = sandbox.stub(vscode.env, 'openExternal')
        await executeDocument(node)
        assert.strictEqual(executeDocumentStub.getCall(0).args[0].scheme, fakeScheme)
        assert.strictEqual(executeDocumentStub.getCall(0).args[0].authority, fakeAuthority)
        assert.strictEqual(executeDocumentStub.getCall(0).args[0].path, fakePath + fakeName)
        assert.strictEqual(executeDocumentStub.getCall(0).args[0].query, fakeQuery + fakeRegion)
    })
})
