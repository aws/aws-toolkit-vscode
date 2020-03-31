/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StsClient } from '../../../shared/clients/stsClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { getAccountId } from '../../../shared/credentials/accountId'
import { ext } from '../../../shared/extensionGlobals'

describe('getAccountId', () => {
    let sandbox: sinon.SinonSandbox

    const credentials: AWS.Credentials = ({} as any) as AWS.Credentials

    const stsClient: StsClient = {
        regionCode: 'abc',
        getCallerIdentity: () => {
            throw new Error('This test was not initialized')
        },
    }

    const clientBuilder = {
        createStsClient: (): StsClient => {
            throw new Error('This test was not initialized')
        },
    }
    let createStsClientStub: sinon.SinonStub<[], StsClient>

    beforeEach(async () => {
        sandbox = sinon.createSandbox()

        createStsClientStub = sandbox.stub(clientBuilder, 'createStsClient').returns(stsClient)

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    })

    afterEach(async () => {
        sandbox.restore()
    })

    it('returns an account id (happy path)', async () => {
        const mockResponse: AWS.STS.GetCallerIdentityResponse = {
            Account: 'some valid account id',
        }

        sandbox.stub(stsClient, 'getCallerIdentity').resolves(mockResponse)

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, mockResponse.Account)
    })

    it('returns undefined if getCallerIdentity returns an undefined account', async () => {
        const mockResponse: AWS.STS.GetCallerIdentityResponse = {
            Account: undefined,
        }

        sandbox.stub(stsClient, 'getCallerIdentity').resolves(mockResponse)

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, undefined)
    })

    it('returns undefined if getCallerIdentity throws', async () => {
        sandbox.stub(stsClient, 'getCallerIdentity').callsFake(() => {
            throw new Error('Simulating service error')
        })

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, undefined)
    })

    it('returns undefined if STS is not defined and toolkitClientBuilder cannot create an STS client', async () => {
        createStsClientStub.restore()
        sandbox.stub(clientBuilder, 'createStsClient').callsFake(() => {
            throw new Error('Simulating STS Client not creating')
        })

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, undefined)
    })
})
