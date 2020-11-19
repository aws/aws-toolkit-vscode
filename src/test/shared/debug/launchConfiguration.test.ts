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
    getConfigsMappedToTemplates,
    getReferencedHandlerPaths,
} from '../../../shared/debug/launchConfiguration'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import { AwsSamDebugConfigurationValidator } from '../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import * as pathutils from '../../../shared/utilities/pathUtils'
import * as testutil from '../../testUtil'
import { TEMPLATE_FILE_GLOB_PATTERN } from '../../../shared/cloudformation/activation'
import { ext } from '../../../shared/extensionGlobals'

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

/**
 * Asserts that the given launch.json representations are equivalent.
 *
 * @param assertSam  If true, assert that all configs are valid type=aws-sam configs.
 *
 * @see samDebugConfigProvider.test.ts:assertEqualLaunchConfigs() which
 * compares a single launch-config item (as opposed to the entire launch.json)
 */
function assertEqualLaunchJsons(actual: any, expected: any, workspace: vscode.Uri, assertSam: boolean) {
    // Deep-copy, don't modify the original structures.
    actual = JSON.parse(JSON.stringify(actual))
    expected = JSON.parse(JSON.stringify(expected))
    // Skip special checks if the inputs are completely wrong, go straight to
    // the deep-compare. This gives more meaningful output.
    const sameLength = actual.length === expected.length

    if (assertSam && sameLength) {
        for (let i = 0; i < actual.length; i++) {
            const configActual = actual[i]
            const configExpected = expected[i]
            const isCodeTarget = 'code' === configActual?.invokeTarget?.target
            const templateActual = configActual?.invokeTarget?.templatePath
            const templateExpected = configExpected?.invokeTarget?.templatePath
            if (templateExpected !== undefined) {
                if (!isCodeTarget && templateActual === undefined) {
                    assert.fail(`not a valid type=aws-sam config: ${JSON.stringify(configActual)}`)
                }
                const fullpath = pathutils.normalize(path.resolve(workspace.fsPath, templateExpected))
                testutil.assertEqualPaths(templateActual, fullpath)
            }
        }
    }

    // Remove noisy properties before doing a deep-compare.
    for (let i = 0; i < actual.length; i++) {
        for (const o of [actual[i], expected[i]]) {
            if (o.invokeTarget?.templatePath) {
                delete o.invokeTarget.templatePath
            }
        }
    }
    assert.deepStrictEqual(actual, expected)
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

    /** Test workspace. */
    const workspace = vscode.workspace.workspaceFolders![0]
    const testLaunchJson = vscode.Uri.file(path.join(workspace.uri.fsPath, '.vscode/launch.json'))
    /** Object representation of the launch.json test file. */
    const testLaunchJsonData = JSON.parse(testutil.fromFile(testLaunchJson.fsPath))
    const templateUriJsPlainApp = vscode.Uri.file(path.join(workspace.uri.fsPath, 'js-plain-sam-app/template.yaml'))
    const templateUriPython37 = vscode.Uri.file(
        path.join(workspace.uri.fsPath, 'python3.7-plain-sam-app/template.yaml')
    )
    const templateUriCsharp = vscode.Uri.file(path.join(workspace.uri.fsPath, 'csharp2.1-plain-sam-app/template.yaml'))

    beforeEach(async () => {
        await ext.templateRegistry.addWatchPattern(TEMPLATE_FILE_GLOB_PATTERN)

        // TODO: remove mocks in favor of testing src/testFixtures/ data.
        mockConfigSource = mock()
        mockSamValidator = mock()
        when(mockConfigSource.getDebugConfigurations()).thenReturn(debugConfigurations)
        when(mockSamValidator.validate(deepEqual(samDebugConfiguration))).thenReturn({ isValid: true })
    })

    afterEach(() => {
        ext.templateRegistry.reset()
    })

    it('getConfigsMappedToTemplates(type=api)', async () => {
        const actual = getConfigsMappedToTemplates(new LaunchConfiguration(templateUriJsPlainApp), 'api')
        assert.deepStrictEqual(actual.size, 0)

        const actual2 = Array.from(getConfigsMappedToTemplates(new LaunchConfiguration(templateUriPython37), 'api'))
        assert.deepStrictEqual(actual2.length, 1)
        assert.deepStrictEqual(actual2[0].name, 'test-launchconfig-6-python3.7')
        assert.deepStrictEqual(actual2[0].invokeTarget.target, 'api')
        assert.deepStrictEqual((actual2[0].invokeTarget as any).logicalId, 'HelloWorldFunction')

        const actual3 = Array.from(getConfigsMappedToTemplates(new LaunchConfiguration(templateUriCsharp), 'api'))
        assert.deepStrictEqual(actual3.length, 1)
        assert.deepStrictEqual(actual3[0].name, 'test-launchconfig-8-api')
        assert.deepStrictEqual(actual3[0].invokeTarget.target, 'api')
        assert.deepStrictEqual((actual3[0].invokeTarget as any).logicalId, 'HelloWorldFunction')
    })

    it('getConfigsMappedToTemplates(type=undefined) returns target=template + target=api resources', async () => {
        const actual = Array.from(
            getConfigsMappedToTemplates(new LaunchConfiguration(templateUriJsPlainApp), undefined)
        )
        assert.deepStrictEqual(actual.length, 1)
        assert.deepStrictEqual((actual[0].invokeTarget as any).logicalId, 'SourceCodeBesidePackageJson')

        const actual2 = Array.from(getConfigsMappedToTemplates(new LaunchConfiguration(templateUriPython37), undefined))
        assert.deepStrictEqual(actual2.length, 2)
        assert.deepStrictEqual(actual2[0].name, 'test-launchconfig-5-python3.7')
        assert.deepStrictEqual(actual2[1].name, 'test-launchconfig-6-python3.7')
        assert.deepStrictEqual(actual2[0].invokeTarget.target, 'template')
        assert.deepStrictEqual(actual2[1].invokeTarget.target, 'api')

        const actual3 = Array.from(getConfigsMappedToTemplates(new LaunchConfiguration(templateUriCsharp), undefined))
        assert.deepStrictEqual(actual3.length, 1)
        assert.deepStrictEqual(actual3[0].name, 'test-launchconfig-8-api')
        assert.deepStrictEqual((actual3[0].invokeTarget as any).logicalId, 'HelloWorldFunction')
    })

    it('gets debug configurations', () => {
        const launchConfig = new LaunchConfiguration(templateUriJsPlainApp)
        const expected = testLaunchJsonData['configurations']
        assertEqualLaunchJsons(launchConfig.getDebugConfigurations(), expected, workspace.uri, false)
    })

    it('gets aws-sam debug configurations', () => {
        const launchConfig = new LaunchConfiguration(templateUriJsPlainApp)
        const expected = (testLaunchJsonData['configurations'] as any[]).filter(
            o => o.type === 'aws-sam' && o.request === 'direct-invoke'
        )
        const actual = launchConfig.getSamDebugConfigurations()
        assertEqualLaunchJsons(actual, expected, workspace.uri, true)
    })

    it('adds single debug configuration', async () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        await launchConfig.addDebugConfiguration(samDebugConfiguration)

        const expected = [samDebugConfiguration, ...debugConfigurations]
        verify(mockConfigSource.setDebugConfigurations(deepEqual(expected))).once()
    })

    it('adds multiple debug configurations', async () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        await launchConfig.addDebugConfigurations([samDebugConfiguration, samDebugConfiguration])

        const expected = [samDebugConfiguration, samDebugConfiguration, ...debugConfigurations]
        verify(mockConfigSource.setDebugConfigurations(deepEqual(expected))).once()
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
    const workspaceFolder = '/absolutely/this/is/the/right/path'

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
