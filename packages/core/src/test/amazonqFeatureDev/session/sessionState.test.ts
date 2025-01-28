/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import {
    MockCodeGenState,
    FeatureDevPrepareCodeGenState,
    FeatureDevCodeGenState,
} from '../../../amazonqFeatureDev/session/sessionState'
import { ToolkitError } from '../../../shared/errors'
import * as crypto from '../../../shared/crypto'
import { createMockSessionStateAction } from '../../amazonq/utils'

import { createTestContext, setupTestHooks } from '../../amazonq/session/testSetup'

describe('sessionStateFeatureDev', () => {
    const context = createTestContext()
    setupTestHooks(context)

    describe('MockCodeGenState', () => {
        it('loops forever in the same state', async () => {
            sinon.stub(crypto, 'randomUUID').returns('upload-id' as ReturnType<(typeof crypto)['randomUUID']>)
            const testAction = createMockSessionStateAction()
            const state = new MockCodeGenState(context.testConfig, context.tabId)
            const result = await state.interact(testAction)

            assert.deepStrictEqual(result, {
                nextState: state,
                interaction: {},
            })
        })
    })

    describe('FeatureDevPrepareCodeGenState', () => {
        it('error when failing to prepare repo information', async () => {
            sinon.stub(vscode.workspace, 'findFiles').throws()
            context.testMocks.createUploadUrl!.resolves({ uploadId: '', uploadUrl: '' })
            const testAction = createMockSessionStateAction()

            await assert.rejects(() => {
                return new FeatureDevPrepareCodeGenState(context.testConfig, [], [], [], context.tabId, 0).interact(
                    testAction
                )
            })
        })
    })

    describe('FeatureDevCodeGenState', () => {
        it('transitions to FeatureDevPrepareCodeGenState when codeGenerationStatus ready ', async () => {
            context.testMocks.getCodeGeneration!.resolves({
                codeGenerationStatus: { status: 'Complete' },
                codeGenerationRemainingIterationCount: 2,
                codeGenerationTotalIterationCount: 3,
            })

            context.testMocks.exportResultArchive!.resolves({ newFileContents: [], deletedFiles: [], references: [] })

            const testAction = createMockSessionStateAction()
            const state = new FeatureDevCodeGenState(context.testConfig, [], [], [], context.tabId, 0, {}, 2, 3)
            const result = await state.interact(testAction)

            const nextState = new FeatureDevPrepareCodeGenState(
                context.testConfig,
                [],
                [],
                [],
                context.tabId,
                1,
                2,
                3,
                undefined
            )

            assert.deepStrictEqual(result.nextState?.deletedFiles, nextState.deletedFiles)
            assert.deepStrictEqual(result.nextState?.filePaths, result.nextState?.filePaths)
            assert.deepStrictEqual(result.nextState?.references, result.nextState?.references)
        })

        it('fails when codeGenerationStatus failed ', async () => {
            context.testMocks.getCodeGeneration!.rejects(new ToolkitError('Code generation failed'))
            const testAction = createMockSessionStateAction()
            const state = new FeatureDevCodeGenState(context.testConfig, [], [], [], context.tabId, 0, {})
            try {
                await state.interact(testAction)
                assert.fail('failed code generations should throw an error')
            } catch (e: any) {
                assert.deepStrictEqual(e.message, 'Code generation failed')
            }
        })
    })
})
