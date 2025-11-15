/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import { CfnEnvironmentManager } from '../../../../awsService/cloudformation/cfn-init/cfnEnvironmentManager'
import { Auth } from '../../../../auth/auth'
import { globals } from '../../../../shared'
import { workspace, commands } from 'vscode'
import fs from '../../../../shared/fs/fs'
import { CfnEnvironmentSelector } from '../../../../awsService/cloudformation/ui/cfnEnvironmentSelector'
import { CfnEnvironmentFileSelector } from '../../../../awsService/cloudformation/ui/cfnEnvironmentFileSelector'
import { OnStackFailure } from '@aws-sdk/client-cloudformation'
import * as environmentApi from '../../../../awsService/cloudformation/cfn-init/cfnEnvironmentApi'
import { getTestWindow } from '../../../shared/vscode/window'

describe('CfnEnvironmentManager', () => {
    let environmentManager: CfnEnvironmentManager
    let mockAuth: sinon.SinonStubbedInstance<Auth>
    let mockWorkspaceState: any
    let mockEnvironmentSelector: sinon.SinonStubbedInstance<CfnEnvironmentSelector>
    let mockEnvironmentFileSelector: sinon.SinonStubbedInstance<CfnEnvironmentFileSelector>
    let fsStub: sinon.SinonStub
    let workspaceStub: sinon.SinonStub
    let parseEnvironmentFilesStub: sinon.SinonStub
    let mockClient: any

    let existsDirStub: sinon.SinonStub
    let existsFileStub: sinon.SinonStub

    beforeEach(() => {
        mockAuth = {
            getConnection: sinon.stub(),
            useConnection: sinon.stub(),
            activeConnection: {
                id: 'profile:test-profile',
                type: 'iam',
                label: 'test-profile',
                state: 'valid',
            } as any,
        } as any

        sinon.stub(Auth, 'instance').get(() => mockAuth)

        mockWorkspaceState = {
            get: sinon.stub(),
            update: sinon.stub(),
        }
        sinon.stub(globals, 'context').value({ workspaceState: mockWorkspaceState })

        mockEnvironmentSelector = {
            selectEnvironment: sinon.stub(),
        } as any

        mockEnvironmentFileSelector = {
            selectEnvironmentFile: sinon.stub(),
        } as any

        fsStub = sinon.stub(fs, 'readFileText')
        // Mock project as initialized by default
        existsDirStub = sinon.stub(fs, 'existsDir').resolves(true)
        existsFileStub = sinon.stub(fs, 'existsFile').resolves(true)

        workspaceStub = sinon.stub(workspace, 'workspaceFolders').value([{ uri: { fsPath: '/test/workspace' } }])
        parseEnvironmentFilesStub = sinon.stub(environmentApi, 'parseCfnEnvironmentFiles')
        mockClient = {}

        environmentManager = new CfnEnvironmentManager(mockClient, mockEnvironmentSelector, mockEnvironmentFileSelector)
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('getSelectedEnvironmentName', () => {
        it('should return selected environment from workspace state', () => {
            mockWorkspaceState.get.returns('test-env')

            const result = environmentManager.getSelectedEnvironmentName()

            assert.strictEqual(result, 'test-env')
            assert(mockWorkspaceState.get.calledWith('aws.cloudformation.selectedEnvironment'))
        })
    })

    describe('promptInitializeIfNeeded', () => {
        it('should return false when project is already initialized', async () => {
            // Project is initialized by default in beforeEach
            const result = await environmentManager.promptInitializeIfNeeded('Test Operation')

            assert.strictEqual(result, false)
            const messages = getTestWindow().shownMessages
            assert.strictEqual(messages.length, 0)
        })

        it('should show warning and execute command when user clicks Initialize Project', async () => {
            existsDirStub.resolves(false)
            existsFileStub.resolves(false)

            getTestWindow().onDidShowMessage((message) => {
                if (message.message === 'You must initialize your CFN Project to perform Test Operation') {
                    message.selectItem('Initialize Project')
                }
            })

            const executeCommandStub = sinon.stub(commands, 'executeCommand')

            const result = await environmentManager.promptInitializeIfNeeded('Test Operation')

            assert.strictEqual(result, true)
            const messages = getTestWindow().shownMessages
            assert(messages.some((m) => m.message === 'You must initialize your CFN Project to perform Test Operation'))
            assert(executeCommandStub.calledWith('aws.cloudformation.init.initializeProject'))
        })
    })

    describe('selectEnvironment', () => {
        it('should show warning when project is not initialized', async () => {
            // Override default - mock project as not initialized
            existsDirStub.resolves(false)
            existsFileStub.resolves(false)

            // Set up message handler to simulate user clicking "Initialize Project"
            getTestWindow().onDidShowMessage((message) => {
                if (message.message === 'You must initialize your CFN Project to perform Environment Selection') {
                    // Simulate user clicking the "Initialize Project" button
                    message.selectItem('Initialize Project')
                }
            })

            const executeCommandStub = sinon.stub(commands, 'executeCommand')

            await environmentManager.selectEnvironment()

            const messages = getTestWindow().shownMessages
            assert(
                messages.some(
                    (m) => m.message === 'You must initialize your CFN Project to perform Environment Selection'
                )
            )
            assert(executeCommandStub.calledWith('aws.cloudformation.init.initializeProject'))
            assert(mockEnvironmentSelector.selectEnvironment.notCalled)
        })

        it('should select environment successfully', async () => {
            const mockEnvironmentLookup = { 'test-env': { name: 'test-env', profile: 'test-profile' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))
            mockEnvironmentSelector.selectEnvironment.resolves('test-env')

            const mockConnection = {
                id: 'profile:test-profile',
                type: 'iam',
                label: 'test-profile',
                state: 'valid',
            } as any
            mockAuth.getConnection.resolves(mockConnection)

            const listener = sinon.stub()
            environmentManager.addListener(listener)

            await environmentManager.selectEnvironment()

            assert(mockEnvironmentSelector.selectEnvironment.calledWith(mockEnvironmentLookup))
            assert(mockWorkspaceState.update.calledWith('aws.cloudformation.selectedEnvironment', 'test-env'))
            assert(mockAuth.getConnection.calledWith({ id: 'profile:test-profile' }))
            assert(mockAuth.useConnection.calledWith(mockConnection))
            assert(listener.called)
        })

        it('should handle fetch error gracefully', async () => {
            fsStub.rejects(new Error('File not found'))

            await environmentManager.selectEnvironment()

            assert(mockEnvironmentSelector.selectEnvironment.notCalled)
        })

        it('should handle no environment selected', async () => {
            const mockEnvironmentLookup = { 'test-env': { name: 'test-env', profile: 'test-profile' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))
            mockEnvironmentSelector.selectEnvironment.resolves(undefined)

            await environmentManager.selectEnvironment()

            assert(mockWorkspaceState.update.notCalled)
            assert(mockAuth.getConnection.notCalled)
        })

        it('should handle missing connection gracefully', async () => {
            const mockEnvironmentLookup = { 'test-env': { name: 'test-env', profile: 'missing-profile' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))
            mockEnvironmentSelector.selectEnvironment.resolves('test-env')
            mockAuth.getConnection.resolves(undefined)

            await environmentManager.selectEnvironment()

            assert(mockWorkspaceState.update.calledWith('aws.cloudformation.selectedEnvironment', 'test-env'))
            assert(mockAuth.useConnection.notCalled)
        })
    })

    describe('fetchAvailableEnvironments', () => {
        it('should fetch environments successfully', async () => {
            const mockEnvironmentLookup = { env1: { name: 'env1', profile: 'profile1' } }
            fsStub.resolves(JSON.stringify({ environments: mockEnvironmentLookup }))

            const result = await environmentManager.fetchAvailableEnvironments()

            assert.deepStrictEqual(result, mockEnvironmentLookup)
        })

        it('should throw error when workspace not found', async () => {
            workspaceStub.value(undefined)

            await assert.rejects(environmentManager.fetchAvailableEnvironments(), /No workspace folder found/)
        })

        it('should throw error when file read fails', async () => {
            fsStub.rejects(new Error('File not found'))

            await assert.rejects(environmentManager.fetchAvailableEnvironments(), /File not found/)
        })
    })

    describe('selectEnvironmentFile', () => {
        let readdirStub: sinon.SinonStub

        beforeEach(() => {
            readdirStub = sinon.stub(fs, 'readdir')
        })

        it('should return undefined when no environment selected', async () => {
            mockWorkspaceState.get.returns(undefined)

            const result = await environmentManager.selectEnvironmentFile('template.yaml', [{ name: 'Param1' }])

            assert.strictEqual(result, undefined)
        })

        it('should collect all environment files and pass to selector', async () => {
            mockWorkspaceState.get.returns('test-env')

            // Mock multiple files
            readdirStub.resolves([
                ['params1.json', 1],
                ['params2.yaml', 1],
                ['params3.yml', 1],
            ])

            // Mock file contents
            fsStub.onCall(0).resolves(
                JSON.stringify({
                    parameters: { Param1: 'value1' },
                    tags: { Tag1: 'value1' },
                    'on-stack-failure': OnStackFailure.DO_NOTHING,
                    'import-existing-resources': true,
                    'include-nested-stacks': false,
                })
            )
            fsStub.onCall(1).resolves('template-file-path: template.yaml\nparameters:\n  Param2: value2')
            fsStub.onCall(2).resolves('template-file-path: wrong-file.yaml\nparameters:\n  Param3: value3')

            // Mock parseEnvironmentFiles response
            parseEnvironmentFilesStub.resolves([
                {
                    fileName: 'params1.json',
                    deploymentConfig: {
                        parameters: { Param1: 'value1' },
                        tags: { Tag1: 'value1' },
                        onStackFailure: OnStackFailure.DO_NOTHING,
                        importExistingResources: true,
                        includeNestedStacks: false,
                    },
                },
                {
                    fileName: 'params2.yaml',
                    deploymentConfig: {
                        templateFilePath: 'template.yaml',
                        parameters: { Param2: 'value2' },
                    },
                },
                {
                    fileName: 'params3.yml',
                    deploymentConfig: {
                        templateFilePath: 'wrong-file.yaml',
                        parameters: { Param3: 'value3' },
                    },
                },
            ])

            // Mock workspace.asRelativePath to return matching path for template.yaml
            sinon.stub(workspace, 'asRelativePath').returns('template.yaml')

            const mockSelectorItem = {
                fileName: 'selected.json',
                hasMatchingTemplatePath: true,
                compatibleParameters: [{ ParameterKey: 'Param1', ParameterValue: 'value1' }],
            }
            mockEnvironmentFileSelector.selectEnvironmentFile.resolves(mockSelectorItem)

            const result = await environmentManager.selectEnvironmentFile('template.yaml', [
                { name: 'Param1' },
                { name: 'Param2' },
                { name: 'Param3' },
            ])

            const [selectorItems, paramCount] = mockEnvironmentFileSelector.selectEnvironmentFile.getCall(0).args

            // Assert call arguments
            assert(mockEnvironmentFileSelector.selectEnvironmentFile.calledOnce)
            assert.strictEqual(selectorItems.length, 3)
            assert.strictEqual(paramCount, 3)

            // Check params1.json
            assert.strictEqual(selectorItems[0].fileName, 'params1.json')
            assert.strictEqual(selectorItems[0].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(selectorItems[0].compatibleParameters, [
                { ParameterKey: 'Param1', ParameterValue: 'value1' },
            ])
            assert.deepStrictEqual(selectorItems[0].optionalFlags?.tags, [{ Key: 'Tag1', Value: 'value1' }])
            assert.deepStrictEqual(selectorItems[0].optionalFlags?.includeNestedStacks, false),
                assert.deepStrictEqual(selectorItems[0].optionalFlags?.importExistingResources, true),
                assert.deepStrictEqual(selectorItems[0].optionalFlags?.onStackFailure, OnStackFailure.DO_NOTHING),
                // Check params2.yaml
                assert.strictEqual(selectorItems[1].fileName, 'params2.yaml')
            assert.strictEqual(selectorItems[1].hasMatchingTemplatePath, true)
            assert.deepStrictEqual(selectorItems[1].compatibleParameters, [
                { ParameterKey: 'Param2', ParameterValue: 'value2' },
            ])

            // Check params3.yml
            assert.strictEqual(selectorItems[2].fileName, 'params3.yml')
            assert.strictEqual(selectorItems[2].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(selectorItems[2].compatibleParameters, [
                { ParameterKey: 'Param3', ParameterValue: 'value3' },
            ])
            assert.strictEqual(result, mockSelectorItem)
        })

        it('should only use files returned from parser', async () => {
            mockWorkspaceState.get.returns('test-env')
            readdirStub.resolves([
                ['valid1.json', 1],
                ['malformed1.json', 1],
                ['valid2.yaml', 1],
                ['malformed2.yaml', 1],
                ['malformed3.yml', 1],
            ])

            // Mock file contents for all 5 files
            fsStub.onCall(0).resolves(JSON.stringify({ parameters: { Param1: 'value1' } }))
            fsStub.onCall(1).resolves('invalid json')
            fsStub.onCall(2).resolves('parameters:\n  Param2: value2')
            fsStub.onCall(3).resolves('invalid: yaml: content')
            fsStub.onCall(4).resolves('null')

            // Parser only returns 2 valid files out of 5
            parseEnvironmentFilesStub.resolves([
                {
                    fileName: 'valid1.json',
                    deploymentConfig: {
                        parameters: { Param1: 'value1' },
                    },
                },
                {
                    fileName: 'valid2.yaml',
                    deploymentConfig: {
                        parameters: { Param2: 'value2' },
                    },
                },
            ])

            const mockSelectorItem = { fileName: 'selected.json' }
            mockEnvironmentFileSelector.selectEnvironmentFile.resolves(mockSelectorItem)

            await environmentManager.selectEnvironmentFile('template.yaml', [{ name: 'Param1' }, { name: 'Param2' }])

            // Verify parseEnvironmentFiles was called with all files
            assert(
                parseEnvironmentFilesStub.calledOnceWith(mockClient, {
                    documents: [
                        { fileName: 'valid1.json', type: 'JSON', content: '{"parameters":{"Param1":"value1"}}' },
                        { fileName: 'malformed1.json', type: 'JSON', content: 'invalid json' },
                        { fileName: 'valid2.yaml', type: 'YAML', content: 'parameters:\n  Param2: value2' },
                        { fileName: 'malformed2.yaml', type: 'YAML', content: 'invalid: yaml: content' },
                        { fileName: 'malformed3.yml', type: 'YAML', content: 'null' },
                    ],
                })
            )

            const [selectorItems, paramCount] = mockEnvironmentFileSelector.selectEnvironmentFile.getCall(0).args

            assert(mockEnvironmentFileSelector.selectEnvironmentFile.calledOnce)
            assert.strictEqual(selectorItems.length, 2)
            assert.strictEqual(paramCount, 2)

            // Check valid1.json
            assert.strictEqual(selectorItems[0].fileName, 'valid1.json')
            assert.strictEqual(selectorItems[0].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(selectorItems[0].compatibleParameters, [
                { ParameterKey: 'Param1', ParameterValue: 'value1' },
            ])

            // Check valid2.yaml
            assert.strictEqual(selectorItems[1].fileName, 'valid2.yaml')
            assert.strictEqual(selectorItems[1].hasMatchingTemplatePath, false)
            assert.deepStrictEqual(selectorItems[1].compatibleParameters, [
                { ParameterKey: 'Param2', ParameterValue: 'value2' },
            ])
        })

        it('should return undefined when parameter file selector returns undefined', async () => {
            mockWorkspaceState.get.returns('test-env')
            readdirStub.resolves([['params.json', 1]])
            fsStub.resolves(JSON.stringify({ parameters: { Param1: 'value1' } }))

            parseEnvironmentFilesStub.resolves([
                {
                    fileName: 'params.json',
                    deploymentConfig: {
                        parameters: { Param1: 'value1' },
                    },
                },
            ])

            mockEnvironmentFileSelector.selectEnvironmentFile.resolves(undefined)

            const result = await environmentManager.selectEnvironmentFile('template.yaml', [{ name: 'Param1' }])

            assert.strictEqual(result, undefined)
        })
    })
})
