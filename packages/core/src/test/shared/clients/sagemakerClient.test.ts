/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { AppDetails, SpaceDetails, DescribeDomainCommandOutput, AppType } from '@aws-sdk/client-sagemaker'
import { DescribeDomainResponse } from '@amzn/sagemaker-client'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { ToolkitError } from '../../../shared/errors'
import { getTestWindow } from '../vscode/window'
import { InstanceTypeInsufficientMemoryMessage } from '../../../awsService/sagemaker/constants'

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

        const spaceAppKey2 = 'domain2__space2'
        const spaceAppKey3 = 'domain2__space3'

        assert.strictEqual(spaceApps.size, 3)
        assert.strictEqual(spaceApps.get(spaceAppKey2)?.App, undefined)
        assert.strictEqual(spaceApps.get(spaceAppKey3)?.App, undefined)
    })

    it('filters out unified studio domains when filterSmusDomains is true', async function () {
        const [spaceApps] = await client.fetchSpaceAppsAndDomains(undefined, true)

        assert.strictEqual(spaceApps.size, 3)
        assert.ok(!spaceApps.has('domain3__space4'))
    })

    it('includes unified studio domains when filterSmusDomains is false', async function () {
        const [spaceApps] = await client.fetchSpaceAppsAndDomains(undefined, false)

        assert.strictEqual(spaceApps.size, 4)
        assert.ok(spaceApps.has('domain3__space4'))
    })

    it('handles AccessDeniedException and shows error message', async function () {
        sinon.stub(client, 'listSpaceApps').rejects({ name: 'AccessDeniedException' })

        await assert.rejects(client.fetchSpaceAppsAndDomains())

        const messages = getTestWindow().shownMessages
        assert.ok(messages.some((m) => m.message.includes('AccessDeniedException')))
    })
})

describe('SagemakerClient.listSpaceApps', function () {
    const region = 'test-region'
    let client: SagemakerClient

    const appDetails: AppDetails[] = [
        { AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1', AppType: AppType.CodeEditor },
        { AppName: 'app2', DomainId: 'domain2', SpaceName: 'space2', AppType: AppType.JupyterLab },
        { AppName: 'app3', DomainId: 'domain2', SpaceName: 'space3', AppType: 'Studio' as any },
    ]

    const spaceDetails: SpaceDetails[] = [
        { SpaceName: 'space1', DomainId: 'domain1' },
        { SpaceName: 'space2', DomainId: 'domain2' },
        { SpaceName: 'space3', DomainId: 'domain2' },
    ]

    beforeEach(function () {
        client = new SagemakerClient(region)
        sinon.stub(client, 'listApps').returns(intoCollection([appDetails]))
        sinon.stub(client, 'listSpaces').returns(intoCollection([spaceDetails]))
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns space apps with correct mapping', async function () {
        const spaceApps = await client.listSpaceApps()

        assert.strictEqual(spaceApps.size, 3)
        assert.strictEqual(spaceApps.get('domain1__space1')?.App?.AppName, 'app1')
        assert.strictEqual(spaceApps.get('domain2__space2')?.App?.AppName, 'app2')
        assert.strictEqual(spaceApps.get('domain2__space3')?.App, undefined) // Studio app filtered out
    })

    it('filters by domain when domainId provided', async function () {
        const newClient = new SagemakerClient(region)
        const listAppsStub = sinon.stub(newClient, 'listApps').returns(intoCollection([]))
        const listSpacesStub = sinon.stub(newClient, 'listSpaces').returns(intoCollection([]))

        await newClient.listSpaceApps('domain1')

        sinon.assert.calledWith(listAppsStub, { DomainIdEquals: 'domain1' })
        sinon.assert.calledWith(listSpacesStub, { DomainIdEquals: 'domain1' })
    })
})

describe('SagemakerClient.listAppForSpace', function () {
    const region = 'test-region'
    let client: SagemakerClient
    let listAppsStub: sinon.SinonStub

    beforeEach(function () {
        client = new SagemakerClient(region)
        listAppsStub = sinon.stub(client, 'listApps')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('returns first app for given domain and space', async function () {
        const appDetails: AppDetails[] = [
            { AppName: 'app1', DomainId: 'domain1', SpaceName: 'space1', AppType: AppType.CodeEditor },
        ]
        listAppsStub.returns(intoCollection([appDetails]))

        const result = await client.listAppForSpace('domain1', 'space1')

        assert.strictEqual(result?.AppName, 'app1')
        sinon.assert.calledWith(listAppsStub, { DomainIdEquals: 'domain1', SpaceNameEquals: 'space1' })
    })

    it('returns undefined when no apps found', async function () {
        listAppsStub.returns(intoCollection([[]]))

        const result = await client.listAppForSpace('domain1', 'space1')

        assert.strictEqual(result, undefined)
    })
})

describe('SagemakerClient.listAppsForDomainMatchSpaceIgnoreCase', function () {
    const region = 'test-region'
    let client: SagemakerClient
    let listAppForSpaceStub: sinon.SinonStub
    let listAppsForDomainStub: sinon.SinonStub

    beforeEach(function () {
        client = new SagemakerClient(region)
        listAppForSpaceStub = sinon.stub(client, 'listAppForSpace')
        listAppsForDomainStub = sinon.stub(client, 'listAppsForDomain')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('uses efficient listAppForSpace when space name is all lowercase', async function () {
        const expectedApp: AppDetails = { AppName: 'app1', DomainId: 'domain1', SpaceName: 'myspace' }
        listAppForSpaceStub.resolves(expectedApp)

        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'myspace')

        assert.strictEqual(result, expectedApp)
        sinon.assert.calledOnceWithExactly(listAppForSpaceStub, 'domain1', 'myspace')
        sinon.assert.notCalled(listAppsForDomainStub)
    })

    it('fetches all apps and does case-insensitive match when space name has uppercase', async function () {
        const apps: AppDetails[] = [
            { AppName: 'app1', DomainId: 'domain1', SpaceName: 'MySpace' },
            { AppName: 'app2', DomainId: 'domain1', SpaceName: 'OtherSpace' },
        ]
        listAppsForDomainStub.resolves(apps)

        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'MySpace')

        assert.strictEqual(result?.AppName, 'app1')
        sinon.assert.calledOnceWithExactly(listAppsForDomainStub, 'domain1')
        sinon.assert.notCalled(listAppForSpaceStub)
    })

    it('matches space name case-insensitively (lowercase query, uppercase in API)', async function () {
        const apps: AppDetails[] = [{ AppName: 'app1', DomainId: 'domain1', SpaceName: 'MYSPACE' }]
        listAppsForDomainStub.resolves(apps)

        // Query with mixed case triggers case-insensitive path
        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'MySpace')

        assert.strictEqual(result?.AppName, 'app1')
    })

    it('matches space name case-insensitively (uppercase query, lowercase in API)', async function () {
        const apps: AppDetails[] = [{ AppName: 'app1', DomainId: 'domain1', SpaceName: 'myspace' }]
        listAppsForDomainStub.resolves(apps)

        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'MYSPACE')

        assert.strictEqual(result?.AppName, 'app1')
    })

    it('returns undefined when no matching app found (case-insensitive path)', async function () {
        const apps: AppDetails[] = [{ AppName: 'app1', DomainId: 'domain1', SpaceName: 'OtherSpace' }]
        listAppsForDomainStub.resolves(apps)

        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'MySpace')

        assert.strictEqual(result, undefined)
    })

    it('returns undefined when domain has no apps (case-insensitive path)', async function () {
        listAppsForDomainStub.resolves([])

        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'MySpace')

        assert.strictEqual(result, undefined)
    })

    it('returns undefined when listAppForSpace returns undefined (lowercase path)', async function () {
        listAppForSpaceStub.resolves(undefined)

        const result = await client.listAppsForDomainMatchSpaceIgnoreCase('domain1', 'myspace')

        assert.strictEqual(result, undefined)
    })
})

describe('SagemakerClient.waitForAppInService', function () {
    const region = 'test-region'
    let client: SagemakerClient
    let describeAppStub: sinon.SinonStub

    beforeEach(function () {
        client = new SagemakerClient(region)
        describeAppStub = sinon.stub(client, 'describeApp')
    })

    afterEach(function () {
        sinon.restore()
    })

    it('resolves when app reaches InService status', async function () {
        describeAppStub.resolves({ Status: 'InService' })

        await client.waitForAppInService('domain1', 'space1', 'CodeEditor')

        sinon.assert.calledOnce(describeAppStub)
    })

    it('throws error when app status is Failed', async function () {
        describeAppStub.resolves({ Status: 'Failed' })

        await assert.rejects(
            client.waitForAppInService('domain1', 'space1', 'CodeEditor'),
            /App failed to start. Status: Failed/
        )
    })

    it('throws error when app status is DeleteFailed', async function () {
        describeAppStub.resolves({ Status: 'DeleteFailed' })

        await assert.rejects(
            client.waitForAppInService('domain1', 'space1', 'CodeEditor'),
            /App failed to start. Status: DeleteFailed/
        )
    })

    it('times out after max retries', async function () {
        describeAppStub.resolves({ Status: 'Pending' })

        const sagemakerModule = await import('../../../shared/clients/sagemaker.js')
        const originalValue = sagemakerModule.waitForAppConfig.hardTimeoutRetries
        sagemakerModule.waitForAppConfig.hardTimeoutRetries = 3

        try {
            await assert.rejects(
                client.waitForAppInService('domain1', 'space1', 'CodeEditor'),
                /Timed out waiting for app/
            )
        } finally {
            sagemakerModule.waitForAppConfig.hardTimeoutRetries = originalValue
        }
    })
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

        await assert.rejects(client.startSpace('my-space', 'my-domain'), /You do not have permission to start spaces/)
    })

    it('prompts user for insufficient memory instance type', async function () {
        describeSpaceStub.resolves({
            SpaceName: 'my-space',
            SpaceSettings: {
                RemoteAccess: 'ENABLED',
                AppType: 'CodeEditor',
                CodeEditorAppSettings: {
                    DefaultResourceSpec: {
                        InstanceType: 'ml.t3.medium', // Insufficient memory type
                    },
                },
            },
        })

        createAppStub.resolves({})

        const promise = client.startSpace('my-space', 'my-domain')

        // Wait for the error message to appear and select "Restart Space and Connect"
        const expectedMessage = InstanceTypeInsufficientMemoryMessage('my-space', 'ml.t3.medium', 'ml.t3.large')
        await getTestWindow().waitForMessage(new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        getTestWindow().getFirstMessage().selectItem('Restart Space and Connect')

        await promise
        sinon.assert.calledOnce(updateSpaceStub)
        sinon.assert.calledOnce(createAppStub)
    })

    it('throws error when user declines insufficient memory upgrade', async function () {
        describeSpaceStub.resolves({
            SpaceName: 'my-space',
            SpaceSettings: {
                RemoteAccess: 'ENABLED',
                AppType: 'CodeEditor',
                CodeEditorAppSettings: {
                    DefaultResourceSpec: {
                        InstanceType: 'ml.t3.medium',
                    },
                },
            },
        })

        const promise = client.startSpace('my-space', 'my-domain')

        // Wait for the error message to appear and select "Cancel"
        const expectedMessage = InstanceTypeInsufficientMemoryMessage('my-space', 'ml.t3.medium', 'ml.t3.large')
        await getTestWindow().waitForMessage(new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        getTestWindow().getFirstMessage().selectItem('Cancel')

        await assert.rejects(promise, (err: ToolkitError) => err.message === 'InstanceType has insufficient memory.')
    })
})
