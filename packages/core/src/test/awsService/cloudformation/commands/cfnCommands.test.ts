/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { OnStackFailure, Parameter } from '@aws-sdk/client-cloudformation'
import {
    rerunLastValidationCommand,
    extractToParameterPositionCursorCommand,
    promptForOptionalFlags,
    promptToSaveToFile,
    addResourceTypesCommand,
    removeResourceTypeCommand,
} from '../../../../awsService/cloudformation/commands/cfnCommands'
import { OptionalFlagMode } from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import * as inputBox from '../../../../awsService/cloudformation/ui/inputBox'
import { fs } from '../../../../shared/fs/fs'
import { ResourceTypeNode } from '../../../../awsService/cloudformation/explorer/nodes/resourceTypeNode'

describe('CfnCommands', function () {
    let sandbox: sinon.SinonSandbox
    let registerCommandStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand').returns({
            dispose: () => {},
        } as vscode.Disposable)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('rerunLastValidationCommand', function () {
        it('should register rerun last validation command', function () {
            const result = rerunLastValidationCommand()
            assert.ok(result)
            assert.ok(registerCommandStub.calledOnce)
            assert.strictEqual(registerCommandStub.firstCall.args[0], 'aws.cloudformation.api.rerunLastValidation')
        })
    })

    describe('extractToParameterPositionCursorCommand', function () {
        it('should register extract to parameter command', function () {
            const mockClient = {} as any
            const result = extractToParameterPositionCursorCommand(mockClient)
            assert.ok(result)
            assert.ok(registerCommandStub.calledOnce)
            assert.strictEqual(
                registerCommandStub.firstCall.args[0],
                'aws.cloudformation.extractToParameter.positionCursor'
            )
        })
    })

    describe('promptForOptionalFlags', function () {
        let chooseOptionalFlagModeStub: sinon.SinonStub
        let getOnStackFailureStub: sinon.SinonStub
        let getIncludeNestedStacksStub: sinon.SinonStub
        let getTagsStub: sinon.SinonStub
        let getImportExistingResourcesStub: sinon.SinonStub
        let getDeploymentModeStub: sinon.SinonStub

        beforeEach(function () {
            chooseOptionalFlagModeStub = sandbox.stub(inputBox, 'chooseOptionalFlagSuggestion')
            getOnStackFailureStub = sandbox.stub(inputBox, 'getOnStackFailure')
            getIncludeNestedStacksStub = sandbox.stub(inputBox, 'getIncludeNestedStacks')
            getTagsStub = sandbox.stub(inputBox, 'getTags')
            getImportExistingResourcesStub = sandbox.stub(inputBox, 'getImportExistingResources')
            getDeploymentModeStub = sandbox.stub(inputBox, 'getDeploymentMode')
        })

        it('should return skip mode with existing file flags', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Skip)

            const fileFlags = {
                onStackFailure: OnStackFailure.DO_NOTHING,
                includeNestedStacks: true,
                tags: [{ Key: 'test', Value: 'value' }],
                importExistingResources: false,
            }

            const result = await promptForOptionalFlags(fileFlags)

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.DO_NOTHING,
                includeNestedStacks: true,
                tags: [{ Key: 'test', Value: 'value' }],
                importExistingResources: false,
                shouldSaveOptions: false,
            })
        })

        it('should use dev friendly defaults', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.DevFriendly)
            getTagsStub.resolves(undefined)

            const result = await promptForOptionalFlags()

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.DO_NOTHING,
                includeNestedStacks: true,
                tags: undefined,
                importExistingResources: true,
                deploymentMode: undefined,
            })
        })

        it('should set shouldSaveOptions to true when input mode collects new values', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Input)
            getOnStackFailureStub.resolves(OnStackFailure.DELETE)
            getIncludeNestedStacksStub.resolves(true)
            getTagsStub.resolves([{ Key: 'Environment', Value: 'prod' }])
            getImportExistingResourcesStub.resolves(false)

            const result = await promptForOptionalFlags()

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.DELETE,
                includeNestedStacks: true,
                tags: [{ Key: 'Environment', Value: 'prod' }],
                importExistingResources: false,
                deploymentMode: undefined,
                shouldSaveOptions: true,
            })
        })

        it('should prompt for deployment mode on stack update when conditions are met', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Input)
            getOnStackFailureStub.resolves(OnStackFailure.ROLLBACK)
            getIncludeNestedStacksStub.resolves(false)
            getTagsStub.resolves(undefined)
            getImportExistingResourcesStub.resolves(false)
            getDeploymentModeStub.resolves('INCREMENTAL')

            const stackDetails = { StackName: 'test-stack' }
            const result = await promptForOptionalFlags(undefined, stackDetails as any)

            assert.ok(getDeploymentModeStub.calledOnce)
            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: false,
                tags: undefined,
                importExistingResources: false,
                deploymentMode: 'INCREMENTAL',
                shouldSaveOptions: true,
            })
        })

        it('should not prompt for deployment mode on stack create', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Input)
            getOnStackFailureStub.resolves(OnStackFailure.ROLLBACK)
            getIncludeNestedStacksStub.resolves(false)
            getTagsStub.resolves(undefined)
            getImportExistingResourcesStub.resolves(false)

            const result = await promptForOptionalFlags()

            assert.ok(getDeploymentModeStub.notCalled)
            assert.strictEqual(result?.deploymentMode, undefined)
        })

        it('should not prompt for deployment mode when importExistingResources is true', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Input)
            getOnStackFailureStub.resolves(OnStackFailure.ROLLBACK)
            getIncludeNestedStacksStub.resolves(false)
            getTagsStub.resolves(undefined)
            getImportExistingResourcesStub.resolves(true)

            const stackDetails = { StackName: 'test-stack' }
            const result = await promptForOptionalFlags(undefined, stackDetails as any)

            assert.ok(getDeploymentModeStub.notCalled)
            assert.strictEqual(result?.deploymentMode, undefined)
        })

        it('should include deploymentMode from fileFlags in skip mode', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Skip)

            const fileFlags = {
                onStackFailure: OnStackFailure.DO_NOTHING,
                includeNestedStacks: true,
                tags: undefined,
                importExistingResources: false,
                deploymentMode: 'COMPLETE_REPLACEMENT' as any,
            }

            const result = await promptForOptionalFlags(fileFlags)

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.DO_NOTHING,
                includeNestedStacks: true,
                tags: undefined,
                importExistingResources: false,
                deploymentMode: 'COMPLETE_REPLACEMENT',
                shouldSaveOptions: false,
            })
        })

        it('should default to REVERT_DRIFT in skip mode when conditions are met', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Skip)

            const fileFlags = {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: false,
                tags: undefined,
                importExistingResources: false,
            }

            const stackDetails = { StackName: 'test-stack' }
            const result = await promptForOptionalFlags(fileFlags, stackDetails as any)

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: false,
                tags: undefined,
                importExistingResources: false,
                deploymentMode: 'REVERT_DRIFT',
                shouldSaveOptions: false,
            })
        })

        it('should not default to REVERT_DRIFT in skip mode when stack does not exist', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Skip)

            const fileFlags = {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: false,
                tags: undefined,
                importExistingResources: false,
            }

            const result = await promptForOptionalFlags(fileFlags)

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: false,
                tags: undefined,
                importExistingResources: false,
                deploymentMode: undefined,
                shouldSaveOptions: false,
            })
        })

        it('should not default to REVERT_DRIFT in skip mode when includeNestedStacks is true', async function () {
            chooseOptionalFlagModeStub.resolves(OptionalFlagMode.Skip)

            const fileFlags = {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: true,
                tags: undefined,
                importExistingResources: false,
            }

            const stackDetails = { StackName: 'test-stack' }
            const result = await promptForOptionalFlags(fileFlags, stackDetails as any)

            assert.deepStrictEqual(result, {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: true,
                tags: undefined,
                importExistingResources: false,
                deploymentMode: undefined,
                shouldSaveOptions: false,
            })
        })
    })

    describe('promptToSaveToFile', function () {
        let shouldSaveFlagsToFileStub: sinon.SinonStub
        let getFilePathStub: sinon.SinonStub
        let workspaceConfigStub: sinon.SinonStub
        let workspaceAsRelativePathStub: sinon.SinonStub
        let fsWriteFileStub: sinon.SinonStub

        beforeEach(function () {
            shouldSaveFlagsToFileStub = sandbox.stub(inputBox, 'shouldSaveFlagsToFile')
            getFilePathStub = sandbox.stub(inputBox, 'getFilePath')
            workspaceConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration')
            workspaceAsRelativePathStub = sandbox.stub(vscode.workspace, 'asRelativePath')
            fsWriteFileStub = sandbox.stub(fs, 'writeFile')
        })

        it('should return early when user chooses not to save', async function () {
            shouldSaveFlagsToFileStub.resolves(false)

            await promptToSaveToFile('/test/env', undefined, undefined)

            assert(getFilePathStub.notCalled)
            assert(fsWriteFileStub.notCalled)
        })

        it('should save JSON file with correct format', async function () {
            shouldSaveFlagsToFileStub.resolves(true)
            getFilePathStub.resolves('/test/env/config.json')
            workspaceAsRelativePathStub.returns('config.json')

            const mockConfig = {
                get: sandbox.stub(),
            }
            mockConfig.get.withArgs('tabSize', 2).returns(2)
            mockConfig.get.withArgs('insertSpaces', true).returns(true)
            workspaceConfigStub.returns(mockConfig)

            const parameters: Parameter[] = [
                { ParameterKey: 'Environment', ParameterValue: 'test' },
                { ParameterKey: 'InstanceType', ParameterValue: 't3.micro' },
            ]

            const optionalFlags = {
                onStackFailure: OnStackFailure.ROLLBACK,
                includeNestedStacks: false,
                tags: [{ Key: 'Project', Value: 'MyApp' }],
                importExistingResources: true,
            }

            await promptToSaveToFile('/test/env', optionalFlags, parameters)

            assert(fsWriteFileStub.calledOnce)
            const [filePath, content] = fsWriteFileStub.getCall(0).args
            assert.strictEqual(filePath, '/test/env/config.json')

            const parsed = JSON.parse(content)
            assert.deepStrictEqual(parsed['parameters'], {
                Environment: 'test',
                InstanceType: 't3.micro',
            })
            assert.deepStrictEqual(parsed['tags'], { Project: 'MyApp' })
            assert.strictEqual(parsed['on-stack-failure'], OnStackFailure.ROLLBACK)
            assert.strictEqual(parsed['include-nested-stacks'], false)
            assert.strictEqual(parsed['import-existing-resources'], true)
        })
    })

    describe('addResourceTypesCommand', function () {
        it('should register add resource types command', function () {
            const mockResourcesManager = { selectResourceTypes: sinon.stub() } as any
            const result = addResourceTypesCommand(mockResourcesManager)
            assert.ok(result)
            assert.ok(registerCommandStub.calledOnce)
            assert.strictEqual(registerCommandStub.firstCall.args[0], 'aws.cloudformation.api.addResourceTypes')
        })
    })

    describe('removeResourceTypeCommand', function () {
        it('should register remove resource type command', function () {
            const mockResourcesManager = { removeResourceType: sinon.stub() } as any
            const result = removeResourceTypeCommand(mockResourcesManager)
            assert.ok(result)
            assert.ok(registerCommandStub.calledOnce)
            assert.strictEqual(registerCommandStub.firstCall.args[0], 'aws.cloudformation.removeResourceType')
        })

        it('should call removeResourceType with node typeName', async function () {
            const mockResourcesManager = { removeResourceType: sinon.stub().resolves() } as any
            removeResourceTypeCommand(mockResourcesManager)

            const commandHandler = registerCommandStub.firstCall.args[1]
            const mockNode = { typeName: 'AWS::S3::Bucket' } as ResourceTypeNode

            await commandHandler(mockNode)

            assert.ok(mockResourcesManager.removeResourceType.calledOnceWith('AWS::S3::Bucket'))
        })
    })
})
