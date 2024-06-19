/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SSM } from 'aws-sdk'
import * as sinon from 'sinon'
import assert from 'assert'

import { updateDocumentVersion } from '../../../ssmDocument/commands/updateDocumentVersion'
import { DocumentItemNodeWriteable } from '../../../ssmDocument/explorer/documentItemNodeWriteable'

import * as picker from '../../../shared/ui/picker'
import { FakeAwsContext } from '../../utilities/fakeAwsContext'
import { DefaultSsmDocumentClient } from '../../../shared/clients/ssmDocumentClient'
import { stub } from '../../utilities/stubber'
import { RegistryItemNode } from '../../../ssmDocument/explorer/registryItemNode'

describe('openDocumentItem', async function () {
    afterEach(function () {
        sinon.restore()
    })

    const fakeDoc: SSM.Types.DocumentIdentifier = {
        Name: 'testDocument',
        DocumentFormat: 'json',
        DocumentType: 'Command',
        Owner: 'Amazon',
    }

    const fakeAwsContext = new FakeAwsContext()

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
        sinon.stub(picker, 'promptUser').onFirstCall().resolves(undefined)
        sinon.stub(picker, 'verifySinglePickerOutput').onFirstCall().returns(fakeVersionSelectionResult)
        sinon.stub(fakeAwsContext, 'getCredentialAccountId').returns('Amazon')
        const ssmClient = stub(DefaultSsmDocumentClient, { regionCode: 'region-1' })
        const documentNode = new DocumentItemNodeWriteable(
            fakeDoc,
            ssmClient,
            fakeRegion,
            stub(RegistryItemNode, {
                documentType: '',
                regionCode: '',
                registryName: '',
                serviceId: undefined,
                label: undefined,
                id: undefined,
                iconPath: undefined,
                description: undefined,
                resourceUri: undefined,
                tooltip: undefined,
                command: undefined,
                collapsibleState: undefined,
                contextValue: undefined,
                accessibilityInformation: undefined,
                checkboxState: undefined,
            })
        )
        sinon.stub(documentNode, 'listSchemaVersion').resolves(fakeSchemaList)
        const updateVersionStub = sinon.stub(documentNode, 'updateDocumentVersion')
        await updateDocumentVersion(documentNode, fakeAwsContext)
        assert.strictEqual(updateVersionStub.getCall(0).args[0], '2')
    })
})
