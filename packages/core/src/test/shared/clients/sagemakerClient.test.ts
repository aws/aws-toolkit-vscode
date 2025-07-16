/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { AppDetails, SpaceDetails, DescribeDomainCommandOutput } from '@aws-sdk/client-sagemaker'
import { DescribeDomainResponse } from '@amzn/sagemaker-client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'

describe('SagemakerClient.fetchSpaceAppsAndDomains', function () {
    const region = 'test-region'
    let client: SagemakerClient
    let listAppsStub: sinon.SinonStub

    const appDetails: AppDetails[] = [
        { AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1', AppType: 'CodeEditor' },
        { AppName: 'app2', DomainId: 'domain2', SpaceName: 'space2', AppType: 'CodeEditor' },
        { AppName: 'app3', DomainId: 'domain2', SpaceName: 'space3', AppType: 'JupyterLab' },
    ]

    const spaceDetails: SpaceDetails[] = [
        { SpaceName: 'space1', DomainId: 'domain1' },
        { SpaceName: 'space2', DomainId: 'domain2' },
        { SpaceName: 'space3', DomainId: 'domain2' },
        { SpaceName: 'space4', DomainId: 'domain3' },
    ]

    const domain1: DescribeDomainResponse = { DomainId: 'domain1', DomainName: 'domainName1' }
    const domain2: DescribeDomainResponse = { DomainId: 'domain2', DomainName: 'domainName2' }
    const domain3: DescribeDomainResponse = {
        DomainId: 'domain3',
        DomainName: 'domainName3',
        DomainSettings: { UnifiedStudioSettings: { DomainId: 'unifiedStudioDomain1' } },
    }

    beforeEach(function () {
        client = new SagemakerClient(region)

        listAppsStub = sinon.stub(client, 'listApps').returns(intoCollection([appDetails]))
        sinon.stub(client, 'listSpaces').returns(intoCollection([spaceDetails]))
        sinon.stub(client, 'describeDomain').callsFake(async ({ DomainId }) => {
            switch (DomainId) {
                case 'domain1':
                    return domain1 as DescribeDomainCommandOutput
                case 'domain2':
                    return domain2 as DescribeDomainCommandOutput
                case 'domain3':
                    return domain3 as DescribeDomainCommandOutput
                default:
                    return {} as DescribeDomainCommandOutput
            }
        })
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns a map of space details with corresponding app details', async function () {
        const [spaceApps, domains] = await client.fetchSpaceAppsAndDomains()

        assert.strictEqual(spaceApps.size, 3)
        assert.strictEqual(domains.size, 3)

        const spaceAppKey1 = 'domain1__space1'
        const spaceAppKey2 = 'domain2__space2'
        const spaceAppKey3 = 'domain2__space3'

        assert.ok(spaceApps.has(spaceAppKey1), 'Expected spaceApps to have key for domain1__space1')
        assert.ok(spaceApps.has(spaceAppKey2), 'Expected spaceApps to have key for domain2__space2')
        assert.ok(spaceApps.has(spaceAppKey3), 'Expected spaceApps to have key for domain2__space3')

        assert.deepStrictEqual(spaceApps.get(spaceAppKey1)?.App?.AppName, 'app1')
        assert.deepStrictEqual(spaceApps.get(spaceAppKey2)?.App?.AppName, 'app2')
        assert.deepStrictEqual(spaceApps.get(spaceAppKey3)?.App?.AppName, 'app3')

        const domainKey1 = 'domain1'
        const domainKey2 = 'domain2'

        assert.ok(domains.has(domainKey1), 'Expected domains to have key for domain1')
        assert.ok(domains.has(domainKey2), 'Expected domains to have key for domain2')

        assert.deepStrictEqual(domains.get(domainKey1)?.DomainName, 'domainName1')
        assert.deepStrictEqual(domains.get(domainKey2)?.DomainName, 'domainName2')
    })

    it('returns map even if some spaces have no matching apps', async function () {
        listAppsStub.returns(intoCollection([{ AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1' }]))

        const [spaceApps] = await client.fetchSpaceAppsAndDomains()
        for (const space of spaceApps) {
            console.log(space[0])
            console.log(space[1])
        }

        const spaceAppKey2 = 'domain2__space2'
        const spaceAppKey3 = 'domain2__space3'

        assert.strictEqual(spaceApps.size, 3)
        assert.strictEqual(spaceApps.get(spaceAppKey2)?.App, undefined)
        assert.strictEqual(spaceApps.get(spaceAppKey3)?.App, undefined)
    })

    describe('SagemakerClient.startSpace', function () {
        const region = 'test-region'
        let client: SagemakerClient
        let describeSpaceStub: sinon.SinonStub
        let updateSpaceStub: sinon.SinonStub
        let waitForSpaceStub: sinon.SinonStub
        let createAppStub: sinon.SinonStub

        beforeEach(function () {
            client = new SagemakerClient(region)
            describeSpaceStub = sinon.stub(client, 'describeSpace')
            updateSpaceStub = sinon.stub(client, 'updateSpace')
            waitForSpaceStub = sinon.stub<any, any>(client as any, 'waitForSpaceInService')
            createAppStub = sinon.stub(client, 'createApp')
        })

        afterEach(function () {
            sinon.restore()
        })

        it('enables remote access and starts the app', async function () {
            describeSpaceStub.resolves({
                SpaceSettings: {
                    RemoteAccess: 'DISABLED',
                    AppType: 'CodeEditor',
                    CodeEditorAppSettings: {
                        DefaultResourceSpec: {
                            InstanceType: 'ml.t3.large',
                            SageMakerImageArn: 'arn:aws:sagemaker:us-west-2:img',
                            SageMakerImageVersionAlias: '1.0.0',
                        },
                    },
                },
            })

            updateSpaceStub.resolves({})
            waitForSpaceStub.resolves()
            createAppStub.resolves({})

            await client.startSpace('my-space', 'my-domain')

            sinon.assert.calledOnce(updateSpaceStub)
            sinon.assert.calledOnce(waitForSpaceStub)
            sinon.assert.calledOnce(createAppStub)
        })

        it('skips enabling remote access if already enabled', async function () {
            describeSpaceStub.resolves({
                SpaceSettings: {
                    RemoteAccess: 'ENABLED',
                    AppType: 'CodeEditor',
                    CodeEditorAppSettings: {
                        DefaultResourceSpec: {
                            InstanceType: 'ml.t3.large',
                            SageMakerImageArn: 'arn:aws:sagemaker:us-west-2:img',
                            SageMakerImageVersionAlias: '1.0.0',
                        },
                    },
                },
            })

            createAppStub.resolves({})

            await client.startSpace('my-space', 'my-domain')

            sinon.assert.notCalled(updateSpaceStub)
            sinon.assert.notCalled(waitForSpaceStub)
            sinon.assert.calledOnce(createAppStub)
        })

        it('throws error on unsupported app type', async function () {
            describeSpaceStub.resolves({
                SpaceSettings: {
                    RemoteAccess: 'ENABLED',
                    AppType: 'Studio',
                },
            })

            await assert.rejects(client.startSpace('my-space', 'my-domain'), /Unsupported AppType "Studio"/)
        })

        it('uses fallback resource spec when none provided', async function () {
            describeSpaceStub.resolves({
                SpaceSettings: {
                    RemoteAccess: 'ENABLED',
                    AppType: 'JupyterLab',
                    JupyterLabAppSettings: {
                        DefaultResourceSpec: {
                            InstanceType: 'ml.t3.large',
                        },
                    },
                },
            })

            createAppStub.resolves({})

            await client.startSpace('my-space', 'my-domain')

            sinon.assert.calledOnceWithExactly(
                createAppStub,
                sinon.match.hasNested('ResourceSpec', {
                    InstanceType: 'ml.t3.large',
                    SageMakerImageArn: 'arn:aws:sagemaker:us-west-2:542918446943:image/sagemaker-distribution-cpu',
                    SageMakerImageVersionAlias: '3.2.0',
                })
            )
        })

        it('handles AccessDeniedException gracefully', async function () {
            describeSpaceStub.rejects({ name: 'AccessDeniedException', message: 'no access' })

            await assert.rejects(
                client.startSpace('my-space', 'my-domain'),
                /You do not have permission to start spaces/
            )
        })
    })
})
