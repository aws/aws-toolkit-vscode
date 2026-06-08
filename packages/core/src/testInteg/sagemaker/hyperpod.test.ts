/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as http from 'http'
import { prepareDevEnvConnection } from '../../awsService/sagemaker/model'
import {
    openHyperPodRemoteConnection,
    startHyperpodSpaceCommand,
    stopHyperPodSpaceCommand,
    connectToHyperPodDevSpace,
} from '../../awsService/sagemaker/hyperpodCommands'
import { parseHyperpodConnectParams } from '../../awsService/sagemaker/uriHandlers'
import { handleGetHyperpodSession } from '../../awsService/sagemaker/detached-server/routes/getHyperpodSession'
import { handleGetHyperpodSessionAsync } from '../../awsService/sagemaker/detached-server/routes/getHyperpodSessionAsync'
import * as hyperpodMappingUtils from '../../awsService/sagemaker/detached-server/hyperpodMappingUtils'
import * as kubectlClientStubModule from '../../awsService/sagemaker/detached-server/kubectlClientStub'
import * as remoteSession from '../../shared/remoteSession'
import { SshConfig } from '../../shared/sshConfig'
import * as credentialMapping from '../../awsService/sagemaker/credentialMapping'
import * as sagemakerUtils from '../../awsService/sagemaker/utils'
import * as sshExtensions from '../../shared/extensions/ssh'
import * as messages from '../../shared/utilities/messages'
import { SagemakerDevSpaceNode } from '../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { SagemakerHyperpodNode } from '../../awsService/sagemaker/explorer/sagemakerHyperpodNode'
import { HyperpodCluster, HyperpodDevSpace } from '../../awsService/sagemaker/detached-server/hyperpodTypes'
import { FakeExtensionContext } from '../../test/fakeExtensionContext'
import { getTestWindow } from '../../test/shared/vscode/window'
import { Result } from '../../shared/utilities/result'
import { fs } from '../../shared/fs/fs'
import globals from '../../shared/extensionGlobals'

// --- Test Helpers ---

function stubConnectionInfra(sandbox: sinon.SinonSandbox) {
    sandbox
        .stub(remoteSession, 'ensureDependencies')
        .resolves(Result.ok({ vsc: '/usr/bin/code', ssm: '/usr/bin/ssm', ssh: '/usr/bin/ssh' }))
    sandbox.stub(SshConfig.prototype, 'ensureValid').resolves(Result.ok(undefined as any))
    sandbox.stub(sagemakerUtils, 'removeKnownHost').resolves()
    sandbox.stub(fs, 'existsFile').resolves(true)
    sandbox.stub(fs, 'readFileText').resolves(JSON.stringify({ pid: 9999, port: '12345' }))
    sandbox.stub(fs, 'delete').resolves()
    sandbox.stub(sagemakerUtils, 'spawnDetachedServer').returns({ unref: sandbox.stub() } as any)
    sandbox.stub(process, 'kill').returns(true)
    sandbox.stub(credentialMapping, 'persistHyperpodConnection').resolves()
    sandbox.stub(require('fs'), 'openSync').returns(42) // eslint-disable-line no-restricted-imports
    const configStub = {
        get: sandbox.stub().returns(120),
        update: sandbox.stub().resolves(),
        inspect: sandbox.stub().returns({ globalValue: 120 }),
    }
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(configStub as any)
}

function createDevSpace(status: string): HyperpodDevSpace {
    return {
        name: 'test-space',
        namespace: 'test-ns',
        cluster: 'test-cluster',
        group: 'workspace.jupyter.org',
        version: 'v1alpha1',
        plural: 'workspaces',
        status,
        appType: 'code-editor',
        creator: 'user',
        accessType: 'Public',
    }
}

function createMockNode(sandbox: sinon.SinonSandbox, devSpace: HyperpodDevSpace) {
    const startStub = sandbox.stub().resolves()
    const stopStub = sandbox.stub().resolves()
    const statusStub = sandbox.stub().resolves('Running')
    const connectionStub = sandbox.stub().resolves({
        type: 'vscode-remote',
        url: 'wss://stream.example.com',
        token: 'tok',
        sessionId: 'sess',
    })
    const eksStub = sandbox.stub().returns({
        name: 'eks-cluster',
        endpoint: 'https://eks.example.com',
        certificateAuthority: { data: 'cert' },
    })

    const kubectlClient = {
        startHyperpodDevSpace: startStub,
        stopHyperpodDevSpace: stopStub,
        getHyperpodSpaceStatus: statusStub,
        createWorkspaceConnection: connectionStub,
        getEksCluster: eksStub,
    }

    const parentNode = {
        getKubectlClient: sandbox.stub().returns(kubectlClient),
        trackPendingNode: sandbox.stub(),
    } as unknown as SagemakerHyperpodNode

    const cluster: HyperpodCluster = {
        clusterName: 'test-cluster',
        clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/test-cluster',
        status: 'InService',
        regionCode: 'us-east-1',
    }

    const node = new SagemakerDevSpaceNode(parentNode, devSpace, cluster, 'us-east-1')
    sandbox.stub(node, 'refreshNode').resolves()
    return { node, stubs: { startStub, stopStub, statusStub, connectionStub } }
}

// --- Integration Tests ---

describe('HyperPod: Deeplink connection flow', function () {
    let sandbox: sinon.SinonSandbox
    let ctx: vscode.ExtensionContext
    let startRemoteStub: sinon.SinonStub

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        ctx = await FakeExtensionContext.create()
        stubConnectionInfra(sandbox)
        startRemoteStub = sandbox.stub(sshExtensions, 'startVscodeRemote').resolves()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('deeplink arrives → prepares connection → launches IDE with SSH remote', async function () {
        const remoteEnv = await prepareDevEnvConnection({
            spaceArn: '',
            ctx,
            connectionType: 'smhp_dl',
            isSMUS: false,
            workspaceName: 'myworkspace',
            clusterName: 'mycluster',
            namespace: 'mynamespace',
            region: 'useast1',
            clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/mycluster',
            accountId: '123456789012',
            wsUrl: 'wss://stream.example.com/session',
            token: 'test-token',
            session: 'session-123',
        })

        await sshExtensions.startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )

        // Connection established with correct hostname
        assert.ok(remoteEnv.hostname.startsWith('smhp_'))
        assert.ok(remoteEnv.hostname.includes('dl_'))
        sinon.assert.calledOnce(startRemoteStub)
        sinon.assert.calledOnce(credentialMapping.persistHyperpodConnection as sinon.SinonStub)
    })

    it('deeplink with missing required params → throws', function () {
        const { SearchParams } = require('../../shared/vscode/uriHandler')
        const params = new SearchParams('sessionId=s&streamUrl=wss://x')

        assert.throws(() => parseHyperpodConnectParams(params), /must be provided/)
    })

    it('side panel click → prepares connection → launches IDE with SSH remote', async function () {
        const remoteEnv = await prepareDevEnvConnection({
            spaceArn: '',
            ctx,
            connectionType: 'smhp_lc',
            isSMUS: false,
            workspaceName: 'devspace1',
            clusterName: 'prodcluster',
            namespace: 'team-ns',
            region: 'uswest2',
            clusterArn: 'arn:aws:eks:us-west-2:123456789012:cluster/prodcluster',
            accountId: '123456789012',
            eksEndpoint: 'https://eks.us-west-2.amazonaws.com',
            eksCertAuthData: 'dGVzdC1jYS1kYXRh',
            eksClusterName: 'prodcluster-eks',
            wsUrl: 'wss://stream.example.com/ws',
            token: 'lc-token',
            session: 'lc-session-1',
        })

        await sshExtensions.startVscodeRemote(
            remoteEnv.SessionProcess,
            remoteEnv.hostname,
            '/home/sagemaker-user',
            remoteEnv.vscPath,
            'sagemaker-user'
        )

        assert.ok(remoteEnv.hostname.startsWith('smhp_'))
        assert.ok(remoteEnv.hostname.includes('lc_'))
        sinon.assert.calledOnce(startRemoteStub)
        sinon.assert.calledOnce(credentialMapping.persistHyperpodConnection as sinon.SinonStub)
    })

    it('connect from remote workspace → error shown, no connection attempt', async function () {
        sandbox.stub(require('../../shared/vscode/env'), 'isRemoteWorkspace').returns(true)

        const { node } = createMockNode(sandbox, createDevSpace('Running'))
        sandbox.stub(globals, 'context').value(ctx)

        await connectToHyperPodDevSpace(node)

        // The test window captures shown messages
        const messages = getTestWindow().shownMessages
        assert.ok(messages.some((m) => m.message.includes('Cannot connect to HyperPod from a remote workspace')))
        sinon.assert.notCalled(startRemoteStub)
    })
})

describe('HyperPod: Space lifecycle (start/stop/connect)', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        sandbox.stub(vscode.commands, 'executeCommand').resolves()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('stop running space → user confirms → space stops', async function () {
        const { node, stubs } = createMockNode(sandbox, createDevSpace('Running'))
        sandbox.stub(messages, 'showConfirmationMessage').resolves(true)

        await stopHyperPodSpaceCommand(node)

        sinon.assert.calledOnce(stubs.stopStub)
    })

    it('stop space → user cancels → no-op', async function () {
        const { node, stubs } = createMockNode(sandbox, createDevSpace('Running'))
        sandbox.stub(messages, 'showConfirmationMessage').resolves(false)

        await stopHyperPodSpaceCommand(node)

        sinon.assert.notCalled(stubs.stopStub)
    })

    it('start invalid/error space → error thrown', async function () {
        const { node: invalidNode } = createMockNode(sandbox, createDevSpace('Invalid'))
        await assert.rejects(() => startHyperpodSpaceCommand(invalidNode), /Cannot start an invalid space/)

        const { node: errorNode } = createMockNode(sandbox, createDevSpace('Error'))
        await assert.rejects(() => startHyperpodSpaceCommand(errorNode), /Cannot start space until resolved/)
    })

    it('connect to stopped space → starts → waits for Running → connects', async function () {
        stubConnectionInfra(sandbox)
        sandbox.stub(sshExtensions, 'startVscodeRemote').resolves()
        sandbox.stub(globals, 'context').value({
            globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
            extensionPath: '/tmp/extension',
            asAbsolutePath: (p: string) => `/tmp/extension/${p}`,
        })

        const { node, stubs } = createMockNode(sandbox, createDevSpace('Stopped'))

        await openHyperPodRemoteConnection(node)

        sinon.assert.calledOnce(stubs.startStub)
        sinon.assert.calledOnce(stubs.connectionStub)
        sinon.assert.calledOnce(sshExtensions.startVscodeRemote as sinon.SinonStub)
    })

    it('connect to stopped space → timeout waiting → throws', async function () {
        stubConnectionInfra(sandbox)
        sandbox.stub(globals, 'context').value({
            globalStorageUri: vscode.Uri.file('/tmp/test-storage'),
            extensionPath: '/tmp/extension',
            asAbsolutePath: (p: string) => `/tmp/extension/${p}`,
        })

        const { node, stubs } = createMockNode(sandbox, createDevSpace('Stopped'))
        stubs.statusStub.resolves('Starting') // never reaches Running

        const realNow = Date.now
        let callCount = 0
        sandbox.stub(Date, 'now').callsFake(() => {
            callCount++
            return callCount === 1 ? realNow() : realNow() + 6 * 60 * 1000
        })

        await assert.rejects(
            () => openHyperPodRemoteConnection(node),
            /Timeout waiting for dev space to reach Running status/
        )
    })
})

describe('HyperPod: Server routes (real HTTP)', function () {
    let server: http.Server
    let port: number
    let sandbox: sinon.SinonSandbox

    function httpGet(path: string): Promise<{ status: number; body: string }> {
        return new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${port}${path}`, (res) => {
                let data = ''
                res.on('data', (chunk) => (data += chunk))
                res.on('end', () => resolve({ status: res.statusCode!, body: data }))
            }).on('error', reject)
        })
    }

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        server = http.createServer((req, res) => {
            const pathname = req.url?.split('?')[0]
            if (pathname === '/get_hyperpod_session') {
                void handleGetHyperpodSession(req, res)
            } else if (pathname === '/get_hyperpod_session_async') {
                void handleGetHyperpodSessionAsync(req, res)
            } else {
                res.writeHead(404)
                res.end('Not Found')
            }
        })
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
                port = (server.address() as { port: number }).port
                resolve()
            })
        })
    })

    afterEach(async function () {
        sandbox.restore()
        await new Promise<void>((resolve) => server.close(() => resolve()))
    })

    it('/get_hyperpod_session → valid credentials → returns session tokens', async function () {
        sandbox.stub(hyperpodMappingUtils, 'readHyperpodMapping').resolves({
            localCredential: {
                'ws:ns:cluster': {
                    namespace: 'ns',
                    clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/cluster',
                    clusterName: 'cluster',
                    endpoint: 'https://eks.example.com',
                    eksClusterName: 'eks-cluster',
                    credentials: { accessKeyId: 'AK', secretAccessKey: 'SK', sessionToken: 'ST' },
                },
            },
        })
        sandbox.stub(kubectlClientStubModule.KubectlClient, 'createForCluster').resolves({
            createWorkspaceConnection: sandbox.stub().resolves({
                type: 'vscode-remote',
                url: 'wss://stream.example.com/sess',
                token: 'tok-abc',
                sessionId: 'sess-xyz',
            }),
        } as any)

        const { status, body } = await httpGet('/get_hyperpod_session?connection_key=ws:ns:cluster')

        assert.strictEqual(status, 200)
        const json = JSON.parse(body)
        assert.strictEqual(json.SessionId, 'sess-xyz')
        assert.strictEqual(json.StreamUrl, 'wss://stream.example.com/sess')
        assert.strictEqual(json.TokenValue, 'tok-abc')
    })

    it('/get_hyperpod_session → no credentials → returns 401', async function () {
        sandbox.stub(hyperpodMappingUtils, 'readHyperpodMapping').resolves({
            localCredential: {
                'ws:ns:cluster': {
                    namespace: 'ns',
                    clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/cluster',
                    clusterName: 'cluster',
                    endpoint: 'https://eks.example.com',
                    eksClusterName: 'eks-cluster',
                    credentials: undefined,
                },
            },
        })

        const { status } = await httpGet('/get_hyperpod_session?connection_key=ws:ns:cluster')
        assert.strictEqual(status, 401)
    })

    it('/get_hyperpod_session → kubectl fails → returns 500', async function () {
        sandbox.stub(hyperpodMappingUtils, 'readHyperpodMapping').resolves({
            localCredential: {
                'ws:ns:cluster': {
                    namespace: 'ns',
                    clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/cluster',
                    clusterName: 'cluster',
                    endpoint: 'https://eks.example.com',
                    eksClusterName: 'eks-cluster',
                    credentials: { accessKeyId: 'AK', secretAccessKey: 'SK' },
                },
            },
        })
        sandbox
            .stub(kubectlClientStubModule.KubectlClient, 'createForCluster')
            .resolves({ createWorkspaceConnection: sandbox.stub().rejects(new Error('K8s timeout')) } as any)

        const { status } = await httpGet('/get_hyperpod_session?connection_key=ws:ns:cluster')
        assert.strictEqual(status, 500)
    })

    it('/get_hyperpod_session_async → fresh entry → returns session tokens', async function () {
        sandbox.stub(hyperpodMappingUtils, 'getHyperpodFreshEntry').resolves({
            sessionId: 'sess-1',
            url: 'wss://ssm.example.com/session',
            token: 'tok-1',
        })

        const { status, body } = await httpGet(
            '/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=req-1'
        )

        assert.strictEqual(status, 200)
        const json = JSON.parse(body)
        assert.strictEqual(json.SessionId, 'sess-1')
        assert.strictEqual(json.TokenValue, 'tok-1')
    })

    it('/get_hyperpod_session_async → no entry → returns 202', async function () {
        sandbox.stub(hyperpodMappingUtils, 'getHyperpodFreshEntry').resolves(undefined)
        sandbox.stub(hyperpodMappingUtils, 'getHyperpodRequestStatus').resolves('not-started')

        const { status } = await httpGet('/get_hyperpod_session_async?connection_key=ws:ns:cluster&request_id=req-1')
        assert.strictEqual(status, 202)
    })
})

describe('HyperPod: Multi-IDE support', function () {
    let sandbox: sinon.SinonSandbox
    let ctx: vscode.ExtensionContext

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        ctx = await FakeExtensionContext.create()
        stubConnectionInfra(sandbox)
        sandbox.stub(sshExtensions, 'startVscodeRemote').resolves()
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('hostname prefix varies by IDE (smhp_ for VS Code, smhpc_ for Cursor)', async function () {
        sandbox.stub(vscode.env, 'appName').value('Visual Studio Code')
        const vscResult = await prepareDevEnvConnection({
            spaceArn: '',
            ctx,
            connectionType: 'smhp_lc',
            isSMUS: false,
            workspaceName: 'ws',
            clusterName: 'cl',
            namespace: 'ns',
            region: 'useast1',
            clusterArn: 'arn:aws:eks:us-east-1:123456789012:cluster/cl',
            accountId: '123456789012',
        })
        assert.ok(vscResult.hostname.startsWith('smhp_'))
        assert.ok(!vscResult.hostname.startsWith('smhpc_'))
    })

    it('Cursor connection uses smhpc_ hostname prefix', async function () {
        sandbox.stub(vscode.env, 'appName').value('Cursor')
        const cursorResult = await prepareDevEnvConnection({
            spaceArn: '',
            ctx,
            connectionType: 'smhp_dl',
            isSMUS: false,
            workspaceName: 'workspace',
            clusterName: 'cluster',
            namespace: 'namespace',
            region: 'uswest2',
            clusterArn: 'arn:aws:eks:us-west-2:123456789012:cluster/cluster',
            accountId: '123456789012',
        })
        assert.ok(cursorResult.hostname.startsWith('smhpc_'))
    })

    it('Kiro connection uses sagemaker-ssh-kiro URI scheme', async function () {
        const { startRemoteViaSageMakerSshKiro } = require('../../awsService/sagemaker/model')
        const mockProcess = sandbox.stub().returns({ run: sandbox.stub().resolves() })

        await startRemoteViaSageMakerSshKiro(
            mockProcess as any,
            'smhp_lc_ws_ns_cl_useast1_123456789012',
            '/home/sagemaker-user',
            '/usr/bin/kiro',
            'sagemaker-user'
        )

        const uri = mockProcess.firstCall.args[1][1] as string
        assert.ok(uri.startsWith('vscode-remote://sagemaker-ssh-kiro+'))
    })
})
