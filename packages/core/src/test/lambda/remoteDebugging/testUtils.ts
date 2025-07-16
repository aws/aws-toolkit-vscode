/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import sinon from 'sinon'
import { Lambda } from 'aws-sdk'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import { InitialData } from '../../../lambda/vue/remoteInvoke/invokeLambda'
import { DebugConfig } from '../../../lambda/remoteDebugging/ldkController'

/**
 * Creates a mock Lambda function configuration for testing
 */
export function createMockFunctionConfig(
    overrides: Partial<Lambda.FunctionConfiguration> = {}
): Lambda.FunctionConfiguration {
    return {
        FunctionName: 'testFunction',
        FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 30,
        Layers: [],
        Environment: { Variables: {} },
        Architectures: ['x86_64'],
        SnapStart: { ApplyOn: 'None' },
        ...overrides,
    }
}

/**
 * Creates a mock Lambda function node for testing
 */
export function createMockFunctionNode(overrides: Partial<LambdaFunctionNode> = {}): LambdaFunctionNode {
    const config = createMockFunctionConfig()
    return {
        configuration: config,
        regionCode: 'us-west-2',
        localDir: '/local/path',
        ...overrides,
    } as LambdaFunctionNode
}

/**
 * Creates mock initial data for RemoteInvokeWebview testing
 */
export function createMockInitialData(overrides: Partial<InitialData> = {}): InitialData {
    const mockFunctionNode = createMockFunctionNode()
    return {
        FunctionName: 'testFunction',
        FunctionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
        FunctionRegion: 'us-west-2',
        InputSamples: [],
        Runtime: 'nodejs18.x',
        LocalRootPath: '/local/path',
        LambdaFunctionNode: mockFunctionNode,
        supportCodeDownload: true,
        runtimeSupportsRemoteDebug: true,
        regionSupportsRemoteDebug: true,
        ...overrides,
    } as InitialData
}

/**
 * Creates a mock debug configuration for testing
 */
export function createMockDebugConfig(overrides: Partial<DebugConfig> = {}): DebugConfig {
    return {
        functionArn: 'arn:aws:lambda:us-west-2:123456789012:function:testFunction',
        functionName: 'testFunction',
        port: 9229,
        localRoot: '/local/path',
        remoteRoot: '/var/task',
        skipFiles: [],
        shouldPublishVersion: false,
        lambdaTimeout: 900,
        layerArn: 'arn:aws:lambda:us-west-2:123456789012:layer:LDKLayerX86:6',
        ...overrides,
    }
}

/**
 * Creates a mock global state for testing
 */
export function createMockGlobalState(): any {
    const stateStorage = new Map<string, any>()
    return {
        get: (key: string) => stateStorage.get(key),
        tryGet: (key: string, type?: any, defaultValue?: any) => {
            const value = stateStorage.get(key)
            return value !== undefined ? value : defaultValue
        },
        update: async (key: string, value: any) => {
            stateStorage.set(key, value)
            return Promise.resolve()
        },
    }
}

/**
 * Sets up common mocks for VSCode APIs
 */
export function setupVSCodeMocks(sandbox: sinon.SinonSandbox) {
    return {
        startDebugging: sandbox.stub(),
        executeCommand: sandbox.stub(),
        onDidTerminateDebugSession: sandbox.stub().returns({ dispose: sandbox.stub() }),
    }
}

/**
 * Creates a mock progress reporter for testing
 */
export function createMockProgress(): any {
    return {
        report: sinon.stub(),
    }
}

/**
 * Sets up common mock operations for LdkClient testing
 */
export function setupMockLdkClientOperations(mockLdkClient: any, mockFunctionConfig: any) {
    mockLdkClient.getFunctionDetail.resolves(mockFunctionConfig)
    mockLdkClient.createOrReuseTunnel.resolves({
        tunnelID: 'tunnel-123',
        sourceToken: 'source-token',
        destinationToken: 'dest-token',
    })
    mockLdkClient.createDebugDeployment.resolves('$LATEST')
    mockLdkClient.startProxy.resolves(true)
    mockLdkClient.stopProxy.resolves(true)
    mockLdkClient.removeDebugDeployment.resolves(true)
    mockLdkClient.deleteDebugVersion.resolves(true)
}

/**
 * Sets up common VSCode debug API mocks
 */
export function setupMockVSCodeDebugAPIs(sandbox: sinon.SinonSandbox) {
    sandbox.stub(require('vscode').debug, 'startDebugging').resolves(true)
    sandbox.stub(require('vscode').commands, 'executeCommand').resolves()
    sandbox.stub(require('vscode').debug, 'onDidTerminateDebugSession').returns({ dispose: sandbox.stub() })
}

/**
 * Sets up mock for revertExistingConfig function
 */
export function setupMockRevertExistingConfig(sandbox: sinon.SinonSandbox) {
    return sandbox.stub(require('../../../lambda/remoteDebugging/ldkController'), 'revertExistingConfig').resolves(true)
}
