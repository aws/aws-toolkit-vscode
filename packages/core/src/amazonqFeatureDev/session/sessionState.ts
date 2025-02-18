/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui'
import * as path from 'path'
import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger/logger'
import { featureDevScheme } from '../constants'
import {
    FeatureDevServiceError,
    IllegalStateTransition,
    NoChangeRequiredException,
    PromptRefusalException,
} from '../errors'
import {
    DeletedFileInfo,
    DevPhase,
    Intent,
    NewFileInfo,
    SessionState,
    SessionStateAction,
    SessionStateConfig,
    SessionStateInteraction,
} from '../../amazonq/commons/types'
import { registerNewFiles } from '../../amazonq/util/files'
import { randomUUID } from '../../shared/crypto'
import { collectFiles } from '../../shared/utilities/workspaceUtils'
import { i18n } from '../../shared/i18n-helper'
import { Messenger } from '../../amazonq/commons/connector/baseMessenger'
import { FollowUpTypes } from '../../amazonq/commons/types'
import {
    BaseCodeGenState,
    BaseMessenger,
    BasePrepareCodeGenState,
    CreateNextStateParams,
} from '../../amazonq/session/sessionState'

export class ConversationNotStartedState implements Omit<SessionState, 'uploadId'> {
    public tokenSource: vscode.CancellationTokenSource
    public readonly phase = DevPhase.INIT

    constructor(public tabID: string) {
        this.tokenSource = new vscode.CancellationTokenSource()
    }

    async interact(_action: SessionStateAction): Promise<SessionStateInteraction> {
        throw new IllegalStateTransition()
    }
}

export class MockCodeGenState implements SessionState {
    public tokenSource: vscode.CancellationTokenSource
    public filePaths: NewFileInfo[]
    public deletedFiles: DeletedFileInfo[]
    public readonly conversationId: string
    public readonly codeGenerationId?: string
    public readonly uploadId: string

    constructor(
        private config: SessionStateConfig,
        public tabID: string
    ) {
        this.tokenSource = new vscode.CancellationTokenSource()
        this.filePaths = []
        this.deletedFiles = []
        this.conversationId = this.config.conversationId
        this.uploadId = randomUUID()
    }

    async interact(action: SessionStateAction): Promise<SessionStateInteraction> {
        // in a `mockcodegen` state, we should read from the `mock-data` folder and output
        // every file retrieved in the same shape the LLM would
        try {
            const files = await collectFiles(
                this.config.workspaceFolders.map((f) => path.join(f.uri.fsPath, './mock-data')),
                this.config.workspaceFolders,
                {
                    excludeByGitIgnore: false,
                }
            )
            const newFileContents = files.map((f) => ({
                zipFilePath: f.zipFilePath,
                fileContent: f.fileContent,
            }))
            this.filePaths = registerNewFiles(
                action.fs,
                newFileContents,
                this.uploadId,
                this.config.workspaceFolders,
                this.conversationId,
                featureDevScheme
            )
            this.deletedFiles = [
                {
                    zipFilePath: 'src/this-file-should-be-deleted.ts',
                    workspaceFolder: this.config.workspaceFolders[0],
                    relativePath: 'src/this-file-should-be-deleted.ts',
                    rejected: false,
                    changeApplied: false,
                },
            ]
            action.messenger.sendCodeResult(
                this.filePaths,
                this.deletedFiles,
                [
                    {
                        licenseName: 'MIT',
                        repository: 'foo',
                        url: 'foo',
                    },
                ],
                this.tabID,
                this.uploadId,
                this.codeGenerationId ?? ''
            )
            action.messenger.sendAnswer({
                message: undefined,
                type: 'system-prompt',
                followUps: [
                    {
                        pillText: i18n('AWS.amazonq.featureDev.pillText.acceptAllChanges'),
                        type: FollowUpTypes.InsertCode,
                        icon: 'ok' as MynahIcons,
                        status: 'success',
                    },
                    {
                        pillText: i18n('AWS.amazonq.featureDev.pillText.provideFeedback'),
                        type: FollowUpTypes.ProvideFeedbackAndRegenerateCode,
                        icon: 'refresh' as MynahIcons,
                        status: 'info',
                    },
                ],
                tabID: this.tabID,
            })
        } catch (e) {
            // TODO: handle this error properly, double check what would be expected behaviour if mock code does not work.
            getLogger().error('Unable to use mock code generation: %O', e)
        }

        return {
            // no point in iterating after a mocked code gen?
            nextState: this,
            interaction: {},
        }
    }
}

export class FeatureDevCodeGenState extends BaseCodeGenState {
    protected handleProgress(messenger: Messenger, action: SessionStateAction, detail?: string): void {
        if (detail) {
            messenger.sendAnswer({
                message: i18n('AWS.amazonq.featureDev.pillText.generatingCode') + `\n\n${detail}`,
                type: 'answer-part',
                tabID: this.tabID,
            })
        }
    }

    protected getScheme(): string {
        return featureDevScheme
    }

    protected getTimeoutErrorCode(): string {
        return 'CodeGenTimeout'
    }

    protected handleGenerationComplete(
        _messenger: Messenger,
        _newFileInfo: NewFileInfo[],
        action: SessionStateAction
    ): void {
        // No special handling needed for feature dev
    }

    protected handleError(messenger: BaseMessenger, codegenResult: any): Error {
        switch (true) {
            case codegenResult.codeGenerationStatusDetail?.includes('Guardrails'): {
                return new FeatureDevServiceError(
                    i18n('AWS.amazonq.featureDev.error.codeGen.default'),
                    'GuardrailsException'
                )
            }
            case codegenResult.codeGenerationStatusDetail?.includes('PromptRefusal'): {
                return new PromptRefusalException()
            }
            case codegenResult.codeGenerationStatusDetail?.includes('EmptyPatch'): {
                if (codegenResult.codeGenerationStatusDetail?.includes('NO_CHANGE_REQUIRED')) {
                    return new NoChangeRequiredException()
                }
                return new FeatureDevServiceError(
                    i18n('AWS.amazonq.featureDev.error.codeGen.default'),
                    'EmptyPatchException'
                )
            }
            case codegenResult.codeGenerationStatusDetail?.includes('Throttling'): {
                return new FeatureDevServiceError(
                    i18n('AWS.amazonq.featureDev.error.throttling'),
                    'ThrottlingException'
                )
            }
            default: {
                return new ToolkitError(i18n('AWS.amazonq.featureDev.error.codeGen.default'), {
                    code: 'CodeGenFailed',
                })
            }
        }
    }

    protected async startCodeGeneration(action: SessionStateAction, codeGenerationId: string): Promise<void> {
        await this.config.proxyClient.startCodeGeneration(
            this.config.conversationId,
            this.config.uploadId,
            action.msg,
            Intent.DEV,
            codeGenerationId,
            this.currentCodeGenerationId
        )

        if (!this.isCancellationRequested) {
            action.messenger.sendAnswer({
                message: i18n('AWS.amazonq.featureDev.pillText.generatingCode'),
                type: 'answer-part',
                tabID: this.tabID,
            })
            action.messenger.sendUpdatePlaceholder(this.tabID, i18n('AWS.amazonq.featureDev.pillText.generatingCode'))
        }
    }

    protected override createNextState(config: SessionStateConfig, params: CreateNextStateParams): SessionState {
        return super.createNextState(
            { ...config, currentCodeGenerationId: this.currentCodeGenerationId },
            params,
            FeatureDevPrepareCodeGenState
        )
    }
}

export class FeatureDevPrepareCodeGenState extends BasePrepareCodeGenState {
    protected preUpload(action: SessionStateAction): void {
        action.messenger.sendAnswer({
            message: i18n('AWS.amazonq.featureDev.pillText.uploadingCode'),
            type: 'answer-part',
            tabID: this.tabID,
        })

        action.messenger.sendUpdatePlaceholder(this.tabID, i18n('AWS.amazonq.featureDev.pillText.uploadingCode'))
    }

    protected postUpload(action: SessionStateAction): void {
        if (!action.tokenSource?.token.isCancellationRequested) {
            action.messenger.sendAnswer({
                message: i18n('AWS.amazonq.featureDev.pillText.contextGatheringCompleted'),
                type: 'answer-part',
                tabID: this.tabID,
            })

            action.messenger.sendUpdatePlaceholder(
                this.tabID,
                i18n('AWS.amazonq.featureDev.pillText.contextGatheringCompleted')
            )
        }
    }

    protected override createNextState(config: SessionStateConfig): SessionState {
        return super.createNextState(config, FeatureDevCodeGenState)
    }
}
