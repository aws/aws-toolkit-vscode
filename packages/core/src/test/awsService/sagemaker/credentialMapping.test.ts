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
    loadMappings,
    saveMappings,
    setSpaceIamProfile,
    setSpaceSsoProfile,
    setSmusSpaceSsoProfile,
    setSpaceCredentials,
} from '../../../awsService/sagemaker/credentialMapping'
import { Auth } from '../../../auth'
import { DevSettings, fs } from '../../../shared'
import globals from '../../../shared/extensionGlobals'
import { SagemakerUnifiedStudioSpaceNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioSpacesParentNode } from '../../../sagemakerunifiedstudio/explorer/nodes/sageMakerUnifiedStudioSpacesParentNode'

describe('credentialMapping', () => {
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
            const mockAuthProvider = {
                getProjectCredentialProvider: sandbox.stub().resolves({
                    getCredentials: sandbox.stub().resolves(),
                }),
            }

            mockNode.getParent.returns(mockParent as any)
            mockParent.getAuthProvider.returns(mockAuthProvider as any)
            mockParent.getProjectId.returns(projectId)

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

    describe('setSmusSpaceSsoProfile', () => {
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

            await setSmusSpaceSsoProfile('test-space', 'project-id')

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
})
