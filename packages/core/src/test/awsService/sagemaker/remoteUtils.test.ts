/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { getRemoteAppMetadata } from '../../../awsService/sagemaker/remoteUtils'
import { fs } from '../../../shared/fs/fs'
import { SagemakerClient } from '../../../shared/clients/sagemaker'

describe('getRemoteAppMetadata', function () {
    let sandbox: sinon.SinonSandbox
    let fsStub: sinon.SinonStub
    let parseRegionStub: sinon.SinonStub
    let describeSpaceStub: sinon.SinonStub
    let loggerStub: sinon.SinonStub

    const mockMetadata = {
        AppType: 'JupyterLab',
        DomainId: 'd-f0lwireyzpjp',
        SpaceName: 'test-ae-3',
        ExecutionRoleArn: 'arn:aws:iam::177118115371:role/service-role/AmazonSageMaker-ExecutionRole-20250415T091941',
        ResourceArn: 'arn:aws:sagemaker:us-west-2:177118115371:app/d-f0lwireyzpjp/test-ae-3/JupyterLab/default',
        ResourceName: 'default',
        AppImageVersion: '',
        ResourceArnCaseSensitive:
            'arn:aws:sagemaker:us-west-2:177118115371:app/d-f0lwireyzpjp/test-ae-3/JupyterLab/default',
        IpAddressType: 'ipv4',
    }

    const mockSpaceDetails = {
        OwnershipSettings: {
            OwnerUserProfileName: 'test-user-profile',
        },
    }

    beforeEach(() => {
        sandbox = sinon.createSandbox()
        fsStub = sandbox.stub(fs, 'readFileText')
        parseRegionStub = sandbox.stub().returns('us-west-2')
        sandbox.replace(require('../../../awsService/sagemaker/utils'), 'parseRegionFromArn', parseRegionStub)

        describeSpaceStub = sandbox.stub().resolves(mockSpaceDetails)
        sandbox.stub(SagemakerClient.prototype, 'describeSpace').callsFake(describeSpaceStub)

        loggerStub = sandbox.stub().returns({
            error: sandbox.stub(),
        })
        sandbox.replace(require('../../../shared/logger/logger'), 'getLogger', loggerStub)
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('successfully reads metadata file and returns remote app metadata', async function () {
        fsStub.resolves(JSON.stringify(mockMetadata))

        const result = await getRemoteAppMetadata()

        assert.deepStrictEqual(result, {
            DomainId: 'd-f0lwireyzpjp',
            UserProfileName: 'test-user-profile',
        })

        sinon.assert.calledWith(fsStub, '/opt/ml/metadata/resource-metadata.json')
        sinon.assert.calledWith(parseRegionStub, mockMetadata.ResourceArn)
        sinon.assert.calledWith(describeSpaceStub, {
            DomainId: 'd-f0lwireyzpjp',
            SpaceName: 'test-ae-3',
        })
    })
})
