/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as sinon from 'sinon'
import * as assert from 'assert'

import { updateDocumentVersion } from '../../../ssmDocument/commands/updateDocumentVersion'
import { DocumentItemNodeWriteable } from '../../../ssmDocument/explorer/documentItemNodeWriteable'

import * as picker from '../../../shared/ui/picker'
import { mock } from '../../utilities/mockito'
import { DefaultSsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { stub } from '../../utilities/stubber'
import { createTestAuth } from '../../testUtil'

describe('openDocumentItem', async function () {
    afterEach(function () {
        sinon.restore()
    })

    const fakeRegion = 'us-east-1'

    const fakeSchemaList: SSM.DocumentVersionInfo[] = [
        {
            Name: 'testDocument',
            DocumentVersion: '1',
        },
        {
            Name: 'testDocument',
            DocumentVersion: '2',
        },
    ]

    const fakeVersionSelectionResult = {
        label: '2',
        description: 'default',
    }

    it('updateDocumentVersion with correct name and version', async function () {
        const auth = await createTestAuth()
        const fakeDoc: SSM.Types.DocumentIdentifier = {
            Name: 'testDocument',
            DocumentFormat: 'json',
            DocumentType: 'Command',
            Owner: auth.getAccountId(),
        }

        sinon.stub(picker, 'promptUser').onFirstCall().resolves(undefined)
        sinon.stub(picker, 'verifySinglePickerOutput').onFirstCall().returns(fakeVersionSelectionResult)
        const ssmClient = stub(DefaultSsmDocumentClient, { regionCode: 'region-1' })
        const documentNode = new DocumentItemNodeWriteable(fakeDoc, ssmClient, fakeRegion, mock())
        sinon.stub(documentNode, 'listSchemaVersion').resolves(fakeSchemaList)
        const updateVersionStub = sinon.stub(documentNode, 'updateDocumentVersion')
        await updateDocumentVersion(documentNode, auth)
        assert.strictEqual(updateVersionStub.getCall(0).args[0], '2')
    })
})
