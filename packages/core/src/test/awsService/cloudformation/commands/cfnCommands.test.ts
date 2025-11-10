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
} from '../../../../awsService/cloudformation/commands/cfnCommands'
import { OptionalFlagMode } from '../../../../awsService/cloudformation/stacks/actions/stackActionRequestType'
import * as inputBox from '../../../../awsService/cloudformation/ui/inputBox'
import { fs } from '../../../../shared/fs/fs'

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
            const result = extractToParameterPositionCursorCommand()
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

        beforeEach(function () {
            chooseOptionalFlagModeStub = sandbox.stub(inputBox, 'chooseOptionalFlagSuggestion')
            getOnStackFailureStub = sandbox.stub(inputBox, 'getOnStackFailure')
            getIncludeNestedStacksStub = sandbox.stub(inputBox, 'getIncludeNestedStacks')
            getTagsStub = sandbox.stub(inputBox, 'getTags')
            getImportExistingResourcesStub = sandbox.stub(inputBox, 'getImportExistingResources')
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
                shouldSaveOptions: true,
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
})
