/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Ec2MetadataClient, IamInfo, InstanceIdentity } from '../../../shared/clients/ec2MetadataClient'
import { Ec2CredentialsProvider } from '../../../auth/providers/ec2CredentialsProvider'
import sinon from 'sinon'

describe('Ec2CredentialsProvider', function () {
    const dummyRegion = 'dummmyRegion'

    const mockIdentity = {
        region: dummyRegion,
    } as InstanceIdentity

    let mockMetadata: Ec2MetadataClient
    let credentialsProvider: Ec2CredentialsProvider
    let getIamInfoStub: sinon.SinonStub<any[], any>

    beforeEach(function () {
        mockMetadata = {} as any as Ec2MetadataClient
        credentialsProvider = new Ec2CredentialsProvider(mockMetadata)
        if (getIamInfoStub) {
            getIamInfoStub.reset()
        }
    })

    it('is valid if EC2 metadata service resolves valid IAM status', async function () {
        mockClient({
            identity: {} as InstanceIdentity,
            validIam: true,
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), true)
    })

    it('is invalid if EC2 metadata resolves invalid IAM status', async function () {
        mockClient({
            validIam: false,
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('is invalid if EC2 metadata service fails to resolve', async function () {
        mockClient({
            fail: true,
        })
        assert.strictEqual(await credentialsProvider.isAvailable(), false)
    })

    it('only validates once per instance', async function () {
        mockClient({
            identity: mockIdentity,
            validIam: true,
        })
        await credentialsProvider.isAvailable()
        await credentialsProvider.isAvailable()
        assert(getIamInfoStub.calledOnce)
    })

    it('returns EC2 retrieved region if available', async function () {
        mockClient({
            identity: mockIdentity,
            validIam: true,
        })

        await credentialsProvider.isAvailable()
        assert.strictEqual(credentialsProvider.getDefaultRegion(), dummyRegion)
    })

    it('returns undefined region when not available', async function () {
        mockClient({
            identity: {} as InstanceIdentity,
            validIam: true,
        })

        await credentialsProvider.isAvailable()
        assert.strictEqual(credentialsProvider.getDefaultRegion(), undefined)
    })

    function mockClient(opts: { fail?: boolean; identity?: InstanceIdentity; validIam?: boolean }) {
        mockMetadata.getInstanceIdentity = sinon.stub().callsFake(() => {
            if (opts.fail) {
                throw new Error('foo')
            } else if (opts.identity) {
                return opts.identity
            }
        })

        const mockIamInfo = {
            Code: opts.validIam ? 'Success' : 'Failure',
        } as IamInfo
        getIamInfoStub = sinon.stub().resolves(mockIamInfo)
        mockMetadata.getIamInfo = getIamInfoStub
    }
})
