/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import { deepEqual, instance, mock, verify, when } from 'ts-mockito'
import * as vscode from 'vscode'
import {
    DebugConfigurationSource,
    LaunchConfiguration,
    getReferencedTemplateResources,
    getReferencedHandlerPaths,
} from '../../../shared/debug/launchConfiguration'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import { AwsSamDebugConfigurationValidator } from '../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import * as pathutils from '../../../shared/utilities/pathUtils'

const samDebugConfiguration: AwsSamDebuggerConfiguration = {
    type: 'aws-sam',
    name: 'name',
    request: 'direct-invoke',
    invokeTarget: {
        target: 'template',
        templatePath: '/template.yaml',
        logicalId: 'resource',
    },
}

function createMockSamDebugConfig(addons?: Partial<AwsSamDebuggerConfiguration>): AwsSamDebuggerConfiguration {
    return {
        ...samDebugConfiguration,
        ...addons,
    }
}

const debugConfigurations: vscode.DebugConfiguration[] = [
    createMockSamDebugConfig(),
    createMockSamDebugConfig({ type: 'not-aws-sam' }),
    createMockSamDebugConfig({ request: 'invalid-request' }),
]

const templateUri = vscode.Uri.file('/template.yaml')

describe('LaunchConfiguration', () => {
    let mockConfigSource: DebugConfigurationSource
    let mockSamValidator: AwsSamDebugConfigurationValidator

    beforeEach(() => {
        mockConfigSource = mock()
        mockSamValidator = mock()

        when(mockConfigSource.getDebugConfigurations()).thenReturn(debugConfigurations)
        when(mockSamValidator.validate(deepEqual(samDebugConfiguration))).thenReturn({ isValid: true })
    })

    it('gets debug configurations', () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        assert.deepStrictEqual(launchConfig.getDebugConfigurations(), debugConfigurations)
    })

    it('gets sam debug configurations', () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        assert.deepStrictEqual(launchConfig.getSamDebugConfigurations(), [samDebugConfiguration])
    })

    it('adds debug configurations', async () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        await launchConfig.addDebugConfiguration(samDebugConfiguration)

        const expected = [samDebugConfiguration, ...debugConfigurations]
        verify(mockConfigSource.setDebugConfigurations(deepEqual(expected))).once()
    })
})

describe('getReferencedTemplateResources', () => {
    it('includes resources that are in the given template', () => {
        const mockLaunchConfig = instance(createMockLaunchConfig())

        const resultSet = getReferencedTemplateResources(mockLaunchConfig)
        const workspaceFolder = mockLaunchConfig.workspaceFolder!.uri.fsPath

        // relative and absolute path of the correct template.yaml file
        assert.strictEqual(resultSet.has('absolutePathGoodTemplate'), true)
        assert.strictEqual(resultSet.has('relativePathGoodTemplate'), true)
        // default case: absolute pathed to root dir
        assert.strictEqual(resultSet.has('resource'), false)
        // relative and absolute paths to incorrect template.yaml file in correct dir
        assert.strictEqual(resultSet.has('relativePathBadTemplate'), false)
        assert.strictEqual(resultSet.has('absolutePathBadTemplate'), false)
        // code type handlers, filtered out
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'inProject', 'relativeRoot'))),
            false
        )
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'inProject', 'absoluteRoot'))),
            false
        )
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'notInProject', 'relativeRoot'))),
            false
        )
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'notInProject', 'absoluteRoot'))),
            false
        )
    })
})

describe('getReferencedHandlerPaths', () => {
    it('includes all resources as absolute paths to root dir + handlers', () => {
        const mockLaunchConfig = instance(createMockLaunchConfig())

        const resultSet = getReferencedHandlerPaths(mockLaunchConfig)
        const workspaceFolder = mockLaunchConfig.workspaceFolder!.uri.fsPath

        //template type handlers, these are all false as we throw all of these out
        assert.strictEqual(resultSet.has('resource'), false)
        assert.strictEqual(resultSet.has('relativePathGoodTemplate'), false)
        assert.strictEqual(resultSet.has('relativePathBadTemplate'), false)
        assert.strictEqual(resultSet.has('absolutePathGoodTemplate'), false)
        assert.strictEqual(resultSet.has('absolutePathBadTemplate'), false)
        // code type handlers, these are all true as we keep all code-type handlers
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'inProject', 'relativeRoot'))),
            true
        )
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'inProject', 'absoluteRoot'))),
            true
        )
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'notInProject', 'differentRelativeRoot'))),
            true
        )
        assert.strictEqual(
            resultSet.has(pathutils.normalize(path.resolve(workspaceFolder, 'notInProject', 'differentAbsoluteRoot'))),
            true
        )
    })
})

function createMockLaunchConfig(): LaunchConfiguration {
    const workspaceFolder = path.resolve('absolutely', 'this', 'is', 'the', 'right', 'path')

    // init mockLaunchConfig
    const mockLaunchConfig: LaunchConfiguration = mock()
    when(mockLaunchConfig.workspaceFolder).thenReturn({
        uri: vscode.Uri.file(workspaceFolder),
        name: 'mockAroundTheClock',
        index: 1,
    })
    when(mockLaunchConfig.scopedResource).thenReturn(vscode.Uri.file(path.join(workspaceFolder, 'template.yaml')))
    when(mockLaunchConfig.getSamDebugConfigurations()).thenReturn([
        // default: template target with not-in-workspace, absolute-pathed templatePath
        createMockSamDebugConfig(),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'template',
                templatePath: 'template.yaml',
                logicalId: 'relativePathGoodTemplate',
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'template',
                templatePath: 'template2.yaml',
                logicalId: 'relativePathBadTemplate',
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'template',
                templatePath: pathutils.normalize(path.resolve(workspaceFolder, 'template.yaml')),
                logicalId: 'absolutePathGoodTemplate',
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'template',
                templatePath: pathutils.normalize(path.resolve(workspaceFolder, 'template2.yaml')),
                logicalId: 'absolutePathBadTemplate',
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'code',
                lambdaHandler: 'relativeRoot',
                projectRoot: 'inProject',
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'code',
                lambdaHandler: 'differentRelativeRoot',
                projectRoot: 'notInProject',
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'code',
                lambdaHandler: 'absoluteRoot',
                projectRoot: pathutils.normalize(path.resolve(workspaceFolder, 'inProject')),
            },
        }),
        createMockSamDebugConfig({
            invokeTarget: {
                target: 'code',
                lambdaHandler: 'differentAbsoluteRoot',
                projectRoot: pathutils.normalize(path.resolve(workspaceFolder, 'notInProject')),
            },
        }),
    ])

    return mockLaunchConfig
}
