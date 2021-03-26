/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { StsClient } from '../../../shared/clients/stsClient'
import { ToolkitClientBuilder } from '../../../shared/clients/toolkitClientBuilder'
import { getAccountId, getAccountIdHack } from '../../../shared/credentials/accountId'
import { ext } from '../../../shared/extensionGlobals'
import { EnvironmentVariables } from '../../../shared/environmentVariables'

describe('getAccountId', function () {
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

    beforeEach(async function () {
        sandbox = sinon.createSandbox()

        createStsClientStub = sandbox.stub(clientBuilder, 'createStsClient').returns(stsClient)

        ext.toolkitClientBuilder = (clientBuilder as any) as ToolkitClientBuilder
    })

    afterEach(async function () {
        sandbox.restore()
    })

    it('returns an account id (happy path)', async function () {
        const mockResponse: AWS.STS.GetCallerIdentityResponse = {
            Account: 'some valid account id',
        }

        sandbox.stub(stsClient, 'getCallerIdentity').resolves(mockResponse)

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, mockResponse.Account)
    })

    it('returns undefined if getCallerIdentity returns an undefined account', async function () {
        const mockResponse: AWS.STS.GetCallerIdentityResponse = {
            Account: undefined,
        }

        sandbox.stub(stsClient, 'getCallerIdentity').resolves(mockResponse)

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, undefined)
    })

    it('returns undefined if getCallerIdentity throws', async function () {
        sandbox.stub(stsClient, 'getCallerIdentity').callsFake(() => {
            throw new Error('Simulating service error')
        })

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, undefined)
    })

    it('returns undefined if STS is not defined and toolkitClientBuilder cannot create an STS client', async function () {
        createStsClientStub.restore()
        sandbox.stub(clientBuilder, 'createStsClient').callsFake(() => {
            throw new Error('Simulating STS Client not creating')
        })

        const accountId = await getAccountId(credentials, 'someregion')

        assert.strictEqual(accountId, undefined)
    })

    // TODO: remove this test after migrating to SDK V3
    it('missing credentials file workaround sets environment variable and resets after', async function () {
        const env: EnvironmentVariables = process.env as EnvironmentVariables
        const region: string = 'someregion'
        const mockResponse: AWS.STS.GetCallerIdentityResponse = {
            Account: 'some valid account id',
        }

        sandbox.stub(stsClient, 'getCallerIdentity').callsFake(async () => {
            if (env.AWS_REGION !== region) {
                throw new Error('Region not set by workaround')
            }

            return mockResponse
        })

        const accountId = await getAccountIdHack(credentials, region)

        assert.strictEqual(accountId, mockResponse.Account)
        assert.strictEqual(env.AWS_REGION, undefined, 'Region environment variable not reset')
    })
})
