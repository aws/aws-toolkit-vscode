/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import {
    persistLocalCredentials,
    persistSSMConnection,
    persistSmusProjectCreds,
    persistHyperpodConnection,
    loadMappings,
    saveMappings,
    setSpaceIamProfile,
    setSpaceSsoProfile,
    setSmusSpaceProfile,
    setSpaceCredentials,
    buildStudioRemoteConnectUrl,
    preRegisterIdcConnection,
    getIdcConnectionStatus,
} from '../../../awsService/sagemaker/credentialMapping'
import { Auth } from '../../../auth'
import { DevSettings, fs } from '../../../shared'
import globals from '../../../shared/extensionGlobals'
import { SagemakerUnifiedStudioSpaceNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'
import * as hyperpodMappingUtils from '../../../awsService/sagemaker/detached-server/hyperpodMappingUtils'

describe('credentialMapping', () => {
    describe('buildStudioRemoteConnectUrl', () => {
        const spaceArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/my-space'
        const baseParams = {
            spaceArn,
            domain: 'd-abc123',
            region: 'us-west-2',
            appType: 'JupyterLab',
            callbackUrl: 'http://localhost:54321/refresh_token',
        }

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('targets the prod Studio host when no dev endpoint is set', () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})

            const url = buildStudioRemoteConnectUrl(baseParams)

            assert.ok(
                url.startsWith('https://studio-d-abc123.studio.us-west-2.sagemaker.aws/remote-connect?'),
                `unexpected host: ${url}`
            )
        })

        it('targets the devo Studio host for a beta endpoint', () => {
            sandbox.stub(DevSettings.instance, 'get').returns({ sagemaker: 'https://beta.whatever' })

            const url = buildStudioRemoteConnectUrl(baseParams)

            assert.ok(
                url.startsWith('https://studio-d-abc123.devo.studio.us-west-2.asfiovnxocqpcry.com/remote-connect?'),
                `unexpected host: ${url}`
            )
        })

        it('uses the region argument rather than the region embedded in the space ARN', () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})

            const url = buildStudioRemoteConnectUrl({ ...baseParams, region: 'eu-west-1' })

            assert.ok(url.includes('studio.eu-west-1.sagemaker.aws'), `unexpected host: ${url}`)
        })

        it('url-encodes the callback parameters and omits requestId', () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})

            const url = buildStudioRemoteConnectUrl(baseParams)
            const query = new URLSearchParams(url.slice(url.indexOf('?') + 1))

            // The ARN's colons and slashes must be escaped, not passed through raw.
            assert.ok(!url.includes('arn:aws:sagemaker'), 'spaceArn was not encoded')
            assert.strictEqual(query.get('spaceArn'), spaceArn)
            assert.strictEqual(query.get('appType'), 'JupyterLab')
            assert.strictEqual(query.get('callbackUrl'), baseParams.callbackUrl)
            assert.strictEqual(query.has('requestId'), false)
        })

        it('points callbackUrl at the supplied local server port', () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})

            const url = buildStudioRemoteConnectUrl({
                ...baseParams,
                callbackUrl: 'http://localhost:9999/refresh_token',
            })
            const query = new URLSearchParams(url.slice(url.indexOf('?') + 1))

            assert.strictEqual(query.get('callbackUrl'), 'http://localhost:9999/refresh_token')
        })
    })

    describe('preRegisterIdcConnection', () => {
        const spaceArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/my-space'

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            sandbox.stub(DevSettings.instance, 'get').returns({})
        })

        afterEach(() => {
            sandbox.restore()
        })

        function writtenData(writeStub: sinon.SinonStub) {
            const raw = writeStub.firstCall.args[1]
            return JSON.parse(typeof raw === 'string' ? raw : raw.toString())
        }

        it("seeds a pending 'initial-connection' entry for the space", async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await preRegisterIdcConnection(spaceArn, 'd-abc123', 'JupyterLab')

            const entry = writtenData(writeStub).deepLink?.[spaceArn]
            assert.ok(entry, 'expected a deepLink entry for the space')
            assert.deepStrictEqual(entry.requests['initial-connection'], {
                sessionId: '',
                token: '',
                url: '',
                status: 'pending',
            })
        })

        it('stores a jupyterlab refresh URL for a JupyterLab space', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await preRegisterIdcConnection(spaceArn, 'd-abc123', 'JupyterLab')

            assert.strictEqual(
                writtenData(writeStub).deepLink[spaceArn].refreshUrl,
                'https://studio-d-abc123.studio.us-west-2.sagemaker.aws/jupyterlab'
            )
        })

        it('stores a code-editor refresh URL for a CodeEditor space', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await preRegisterIdcConnection(spaceArn, 'd-abc123', 'CodeEditor')

            assert.strictEqual(
                writtenData(writeStub).deepLink[spaceArn].refreshUrl,
                'https://studio-d-abc123.studio.us-west-2.sagemaker.aws/code-editor'
            )
        })

        it('leaves deepLink entries for other spaces intact', async () => {
            const otherArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/other-space'
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(
                JSON.stringify({
                    deepLink: {
                        [otherArn]: { refreshUrl: 'https://example.com/other', requests: {} },
                    },
                })
            )
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await preRegisterIdcConnection(spaceArn, 'd-abc123', 'JupyterLab')

            const data = writtenData(writeStub)
            assert.strictEqual(data.deepLink[otherArn].refreshUrl, 'https://example.com/other')
            assert.ok(data.deepLink[spaceArn], 'expected the new entry to be added alongside')
        })
    })

    describe('getIdcConnectionStatus', () => {
        const spaceArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/my-space'

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        function stubMappings(data: unknown) {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(data))
        }

        it("returns the status of the 'initial-connection' request", async () => {
            stubMappings({
                deepLink: {
                    [spaceArn]: {
                        refreshUrl: 'https://example.com',
                        requests: { 'initial-connection': { status: 'fresh' } },
                    },
                },
            })

            assert.strictEqual(await getIdcConnectionStatus(spaceArn), 'fresh')
        })

        it('returns undefined when no mappings file exists', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)

            assert.strictEqual(await getIdcConnectionStatus(spaceArn), undefined)
        })

        it('returns undefined when the space has no deepLink entry', async () => {
            stubMappings({ deepLink: {} })

            assert.strictEqual(await getIdcConnectionStatus(spaceArn), undefined)
        })

        it("returns undefined when the entry has no 'initial-connection' request", async () => {
            stubMappings({
                deepLink: { [spaceArn]: { refreshUrl: 'https://example.com', requests: {} } },
            })

            assert.strictEqual(await getIdcConnectionStatus(spaceArn), undefined)
        })

        it('does not consume or modify the entry, so polling is safe', async () => {
            stubMappings({
                deepLink: {
                    [spaceArn]: {
                        refreshUrl: 'https://example.com',
                        requests: { 'initial-connection': { status: 'pending' } },
                    },
                },
            })
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            assert.strictEqual(await getIdcConnectionStatus(spaceArn), 'pending')
            assert.strictEqual(await getIdcConnectionStatus(spaceArn), 'pending')
            assert.ok(writeStub.notCalled, 'reading the status must not write mappings')
        })
    })

    describe('persistLocalCredentials', () => {
        const appArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-f0lwireyzpjp/test-space'

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('writes IAM profile to mappings', async () => {
            sandbox.stub(Auth.instance, 'getCurrentProfileId').returns('profile:my-iam-profile')
            sandbox.stub(fs, 'existsFile').resolves(false) // simulate no existing mapping file
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistLocalCredentials(appArn)

            assert.ok(writeStub.calledOnce)
            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assert.deepStrictEqual(data.localCredential?.[appArn], {
                type: 'iam',
                profileName: 'profile:my-iam-profile',
            })
        })

        it('writes SSO credentials to mappings', async () => {
            sandbox.stub(Auth.instance, 'getCurrentProfileId').returns('sso:my-sso-profile')
            sandbox.stub(globals.loginManager.store, 'credentialsCache').value({
                'sso:my-sso-profile': {
                    credentials: {
                        accessKeyId: 'AKIA123',
                        secretAccessKey: 'SECRET',
                        sessionToken: 'TOKEN',
                    },
                },
            })
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistLocalCredentials(appArn)

            assert.ok(writeStub.calledOnce)
            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.localCredential?.[appArn], {
                type: 'sso',
                accessKey: 'AKIA123',
                secret: 'SECRET',
                token: 'TOKEN',
            })
        })

        it('throws if no current profile ID is available', async () => {
            sandbox.stub(Auth.instance, 'getCurrentProfileId').returns(undefined)

            await assert.rejects(() => persistLocalCredentials(appArn), {
                message: 'No current profile ID available for saving space credentials.',
            })
        })
    })

    describe('persistSSMConnection', () => {
        const appArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-f0lwireyzpjp/test-space'
        const domain = 'd-f0lwireyzpjp'
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        function assertRefreshUrlMatches(writtenUrl: string, expectedSubdomain: string) {
            assert.ok(
                writtenUrl.startsWith(`https://studio-${domain}.${expectedSubdomain}`),
                `Expected refresh URL to start with https://studio-${domain}.${expectedSubdomain}, got ${writtenUrl}`
            )
        }

        it('uses default (studio) endpoint if no custom endpoint is set', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Stub the AWS API call
            const mockDescribeSpace = sandbox.stub().resolves({
                SpaceSettings: {
                    AppType: 'JupyterLab',
                },
            })
            sandbox.stub(require('../../../shared/clients/sagemaker'), 'SagemakerClient').returns({
                describeSpace: mockDescribeSpace,
            })

            await persistSSMConnection(appArn, domain)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'studio.us-west-2.sagemaker.aws')
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: '-',
                url: '-',
                token: '-',
                status: 'fresh',
            })
        })

        it('uses devo subdomain for beta endpoint', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({ sagemaker: 'https://beta.whatever' })
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Stub the AWS API call
            const mockDescribeSpace = sandbox.stub().resolves({
                SpaceSettings: {
                    AppType: 'JupyterLab',
                },
            })
            sandbox.stub(require('../../../shared/clients/sagemaker'), 'SagemakerClient').returns({
                describeSpace: mockDescribeSpace,
            })

            await persistSSMConnection(appArn, domain, 'sess', 'wss://ws', 'token')

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'devo.studio.us-west-2.asfiovnxocqpcry.com')
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: 'sess',
                url: 'wss://ws',
                token: 'token',
                status: 'fresh',
            })
        })

        it('uses loadtest subdomain for gamma endpoint', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({ sagemaker: 'https://gamma.example' })
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Stub the AWS API call
            const mockDescribeSpace = sandbox.stub().resolves({
                SpaceSettings: {
                    AppType: 'JupyterLab',
                },
            })
            sandbox.stub(require('../../../shared/clients/sagemaker'), 'SagemakerClient').returns({
                describeSpace: mockDescribeSpace,
            })

            await persistSSMConnection(appArn, domain)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(
                data.deepLink?.[appArn]?.refreshUrl,
                'loadtest.studio.us-west-2.asfiovnxocqpcry.com'
            )
        })

        // TODO: Skipped due to hardcoded appSubDomain. Currently hardcoded to 'jupyterlab' due to
        // a bug in Studio that only supports refreshing the token for both CodeEditor and JupyterLab
        // Apps in the jupyterlab subdomain. This will be fixed shortly after NYSummit launch to
        // support refresh URL in CodeEditor subdomain. Additionally, appType will be determined by
        // the deeplink URI rather than the describeSpace call from the toolkit.
        it.skip('throws error when app type is unsupported', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)

            // Stub the AWS API call to return an unsupported app type
            const mockDescribeSpace = sandbox.stub().resolves({
                SpaceSettings: {
                    AppType: 'UnsupportedApp',
                },
            })
            sandbox.stub(require('../../../shared/clients/sagemaker'), 'SagemakerClient').returns({
                describeSpace: mockDescribeSpace,
            })

            await assert.rejects(() => persistSSMConnection(appArn, domain), {
                name: 'Error',
                message:
                    'Unsupported or missing app type for space. Expected JupyterLab or CodeEditor, got: UnsupportedApp',
            })
        })

        it('stores undefined refreshUrl when isSMUS=true and no providedRefreshUrl (older console)', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(appArn, domain, 'sess-123', 'wss://smus-ws', 'token-xyz', 'jupyterlab', true)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            // No providedRefreshUrl → refreshUrl stays undefined (connection cannot refresh)
            assert.strictEqual(data.deepLink?.[appArn]?.refreshUrl, undefined)

            // Verify SSM connection info is stored correctly
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: 'sess-123',
                url: 'wss://smus-ws',
                token: 'token-xyz',
                status: 'fresh',
            })
        })

        it('persists the console-supplied refreshUrl when isSMUS=true', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            const reconnectBaseUrl =
                'https://d-abc123xyz789.sagemaker-gamma.us-west-2.on.aws/projects/4m8bqfexample/code-spaces'

            await persistSSMConnection(
                appArn,
                domain,
                'sess-smus',
                'wss://smus-ws',
                'token-smus',
                'jupyterlab',
                true,
                reconnectBaseUrl
            )

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            // The SMUS URL is used verbatim — no derivation, no hardcoded stage.
            assert.strictEqual(data.deepLink?.[appArn]?.refreshUrl, reconnectBaseUrl)
            assert.strictEqual(data.deepLink?.[appArn]?.isSMUS, true)
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: 'sess-smus',
                url: 'wss://smus-ws',
                token: 'token-smus',
                status: 'fresh',
            })
        })

        it('ignores a provided refreshUrl when isSMUS=false and derives the SageMaker AI URL', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(
                appArn,
                domain,
                'sess-ai',
                'wss://sm-ws',
                'token-ai',
                'jupyterlab',
                false,
                'https://should-be-ignored.example.com/projects/p/code-spaces'
            )

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'studio.us-west-2.sagemaker.aws')
        })

        it('stores valid refreshUrl when isSMUS=false (SageMaker AI behavior)', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(appArn, domain, 'sess-456', 'wss://sm-ws', 'token-abc', 'jupyterlab', false)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            // Verify refreshUrl is present for SageMaker AI connections
            assert.ok(data.deepLink?.[appArn]?.refreshUrl)
            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'studio.us-west-2.sagemaker.aws')

            // Verify SSM connection info is stored correctly
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: 'sess-456',
                url: 'wss://sm-ws',
                token: 'token-abc',
                status: 'fresh',
            })
        })

        it('stores valid refreshUrl when isSMUS is undefined (default SageMaker AI behavior)', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Call without isSMUS parameter (should default to SageMaker AI behavior)
            await persistSSMConnection(appArn, domain, 'sess-789', 'wss://default-ws', 'token-def', 'jupyterlab')

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            // Verify refreshUrl is present when isSMUS is not specified
            assert.ok(data.deepLink?.[appArn]?.refreshUrl)
            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'studio.us-west-2.sagemaker.aws')

            // Verify SSM connection info is stored correctly
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: 'sess-789',
                url: 'wss://default-ws',
                token: 'token-def',
                status: 'fresh',
            })
        })

        it('persists isSMUS: false when called with isSMUS=false', async function () {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(appArn, domain, 'sess-sm', 'wss://sm-ws', 'token-sm', 'jupyterlab', false)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assert.strictEqual(data.deepLink?.[appArn]?.isSMUS, false)
        })
    })

    describe('persistSmusProjectCreds', () => {
        const appArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-f0lwireyzpjp/test-space'
        const projectId = 'test-project-id'
        let sandbox: sinon.SinonSandbox
        let mockNode: sinon.SinonStubbedInstance<SagemakerUnifiedStudioSpaceNode>
        let mockParent: sinon.SinonStubbedInstance<SageMakerUnifiedStudioSpacesParentNode>

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            mockNode = sandbox.createStubInstance(SagemakerUnifiedStudioSpaceNode)
            mockParent = sandbox.createStubInstance(SageMakerUnifiedStudioSpacesParentNode)
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('persists SMUS project credentials', async () => {
            const mockCredentialProvider = {
                getCredentials: sandbox.stub().resolves(),
                startProactiveCredentialRefresh: sandbox.stub(),
            }

            const mockAuthProvider = {
                getProjectCredentialProvider: sandbox.stub().resolves(mockCredentialProvider),
            }

            mockNode.getParent.returns(mockParent as any)
            mockParent.getAuthProvider.returns(mockAuthProvider as any)
            mockParent.getProjectId.returns(projectId)
            sandbox.stub(require('../../../sagemakerunifiedstudio/auth/model'), 'isSmusSsoConnection').returns(true)

            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSmusProjectCreds(appArn, mockNode as any)

            assert.ok(writeStub.calledOnce)
            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.localCredential?.[appArn], {
                type: 'sso',
                smusProjectId: projectId,
            })

            // Verify the correct methods were called
            assert.ok(mockAuthProvider.getProjectCredentialProvider.calledWith(projectId))
            assert.ok(mockCredentialProvider.getCredentials.calledOnce)
            assert.ok(mockCredentialProvider.startProactiveCredentialRefresh.calledOnce)
        })
    })

    describe('loadMappings', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('returns empty object when file does not exist', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)

            const result = await loadMappings()

            assert.deepStrictEqual(result, {})
        })

        it('loads and parses existing mappings', async () => {
            const mockData = { localCredential: { 'test-arn': { type: 'iam' as const, profileName: 'test' } } }
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves(JSON.stringify(mockData))

            const result = await loadMappings()

            assert.deepStrictEqual(result, mockData)
        })

        it('returns empty object on parse error', async () => {
            sandbox.stub(fs, 'existsFile').resolves(true)
            sandbox.stub(fs, 'readFileText').resolves('invalid json')

            const result = await loadMappings()

            assert.deepStrictEqual(result, {})
        })
    })

    describe('saveMappings', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('saves mappings to file', async () => {
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()
            const testData = { localCredential: { 'test-arn': { type: 'iam' as const, profileName: 'test' } } }

            await saveMappings(testData)

            assert.ok(writeStub.calledOnce)
            const [, content, options] = writeStub.firstCall.args
            assert.strictEqual(content, JSON.stringify(testData, undefined, 2))
            assert.deepStrictEqual(options, { mode: 0o600, atomic: true })
        })
    })

    describe('setSpaceIamProfile', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('sets IAM profile for space', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await setSpaceIamProfile('test-space', 'test-profile')

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.localCredential?.['test-space'], {
                type: 'iam',
                profileName: 'test-profile',
            })
        })
    })

    describe('setSpaceSsoProfile', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('sets SSO profile for space', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await setSpaceSsoProfile('test-space', 'access-key', 'secret', 'token')

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.localCredential?.['test-space'], {
                type: 'sso',
                accessKey: 'access-key',
                secret: 'secret',
                token: 'token',
            })
        })
    })

    describe('setSmusSpaceProfile', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('sets SMUS SSO profile for space', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await setSmusSpaceProfile('test-space', 'project-id', 'sso')

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.localCredential?.['test-space'], {
                type: 'sso',
                smusProjectId: 'project-id',
            })
        })
    })

    describe('setSpaceCredentials', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('sets space credentials with refresh URL', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()
            const credentials = { sessionId: 'sess', url: 'ws://test', token: 'token' }

            await setSpaceCredentials('test-space', 'https://refresh.url', credentials)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.deepLink?.['test-space'], {
                refreshUrl: 'https://refresh.url',
                requests: {
                    'initial-connection': {
                        ...credentials,
                        status: 'fresh',
                    },
                },
            })
        })
    })

    describe('persistHyperpodConnection', () => {
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        function stubCredentials(creds?: { accessKeyId: string; secretAccessKey: string; sessionToken: string }) {
            sandbox.stub(hyperpodMappingUtils, 'readHyperpodMapping').resolves({})
            const writeStub = sandbox.stub(hyperpodMappingUtils, 'writeHyperpodMapping').resolves()
            sandbox.stub(globals, 'awsContext').value({
                getCredentials: () => Promise.resolve(creds),
            })
            return writeStub
        }

        it('stores localCredential and deepLink sections', async () => {
            const writeStub = stubCredentials({
                accessKeyId: 'AKIA123',
                secretAccessKey: 'secret',
                sessionToken: 'token',
            })

            await persistHyperpodConnection(
                'myspace',
                'default',
                'arn:aws:eks:us-east-2:123456789012:cluster/mycluster',
                'mycluster',
                'https://eks.endpoint',
                'certdata',
                'us-east-2',
                'wss://stream.url',
                'session-token',
                'session-id',
                'mycluster'
            )

            assert.ok(writeStub.calledOnce)
            const written = writeStub.firstCall.args[0]
            assert.strictEqual(written.localCredential?.['myspace:default:mycluster']?.clusterName, 'mycluster')
            assert.strictEqual(
                written.localCredential?.['myspace:default:mycluster']?.credentials?.accessKeyId,
                'AKIA123'
            )
            assert.strictEqual(
                written.deepLink?.['myspace:default:mycluster']?.requests['initial-connection']?.status,
                'fresh'
            )
            assert.strictEqual(
                written.deepLink?.['myspace:default:mycluster']?.requests['initial-connection']?.url,
                'wss://stream.url'
            )
        })

        it('does not write deepLink when wsUrl or token is missing', async () => {
            const writeStub = stubCredentials(undefined)

            await persistHyperpodConnection(
                'myspace',
                'default',
                'arn:aws:eks:us-east-2:123456789012:cluster/mycluster',
                'mycluster',
                'https://eks.endpoint',
                'certdata',
                'us-east-2',
                undefined,
                undefined,
                undefined,
                'mycluster'
            )

            assert.ok(writeStub.calledOnce)
            const written = writeStub.firstCall.args[0]
            assert.strictEqual(written.localCredential?.['myspace:default:mycluster']?.clusterName, 'mycluster')
            assert.strictEqual(written.deepLink, undefined)
        })

        it('stores refreshUrl in localCredential when provided', async () => {
            const writeStub = stubCredentials(undefined)

            await persistHyperpodConnection(
                'myspace',
                'default',
                'arn:aws:eks:us-east-2:123456789012:cluster/mycluster',
                'mycluster',
                'https://eks.endpoint',
                'certdata',
                'us-east-2',
                undefined,
                undefined,
                undefined,
                'mycluster',
                'https://studio.example.com/hyperPod/clusters/mycluster/myspace'
            )

            assert.ok(writeStub.calledOnce)
            const written = writeStub.firstCall.args[0]
            assert.strictEqual(
                written.localCredential?.['myspace:default:mycluster']?.refreshUrl,
                'https://studio.example.com/hyperPod/clusters/mycluster/myspace'
            )
        })

        it('does not write deepLink when wsUrl is a presigned vscode:// URL (LC connections)', async () => {
            const writeStub = stubCredentials({
                accessKeyId: 'AKIA123',
                secretAccessKey: 'secret',
                sessionToken: 'token',
            })

            await persistHyperpodConnection(
                'myspace',
                'default',
                'arn:aws:eks:us-east-2:123456789012:cluster/mycluster',
                'mycluster',
                'https://eks.endpoint',
                'certdata',
                'us-east-2',
                'vscode://amazonwebservices.aws-toolkit-vscode/connect/workspace?streamUrl=wss://ssm.example.com',
                'session-token',
                'session-id',
                'mycluster'
            )

            assert.ok(writeStub.calledOnce)
            const written = writeStub.firstCall.args[0]
            assert.strictEqual(written.localCredential?.['myspace:default:mycluster']?.clusterName, 'mycluster')
            assert.strictEqual(written.deepLink, undefined)
        })
    })
})
