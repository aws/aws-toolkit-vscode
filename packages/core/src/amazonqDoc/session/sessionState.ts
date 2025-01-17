/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { DocGenerationStep, docScheme, getFileSummaryPercentage, Mode } from '../constants'

import { CodeReference, UploadHistory } from '../../amazonq/webview/ui/connector'
import { i18n } from '../../shared/i18n-helper'

import { DeletedFileInfo, NewFileInfo, SessionState, SessionStateAction, SessionStateConfig } from '../types'
import { Intent } from '../../amazonqFeatureDev'
import {
    ContentLengthError,
    DocServiceError,
    NoChangeRequiredException,
    PromptRefusalException,
    PromptTooVagueError,
    PromptUnrelatedError,
    ReadmeTooLargeError,
    ReadmeUpdateTooLargeError,
    WorkspaceEmptyError,
} from '../errors'
import { DocMessenger } from '../messenger'
import { BaseCodeGenState, BasePrepareCodeGenState } from '../../amazonqFeatureCommon/session/sessionState'

export class DocCodeGenState extends BaseCodeGenState {
    protected handleProgress(messenger: DocMessenger, detail?: string): void {
        if (detail) {
            const progress = getFileSummaryPercentage(detail)
            messenger.sendDocProgress(
                this.tabID,
                progress === 100 ? DocGenerationStep.GENERATING_ARTIFACTS : DocGenerationStep.SUMMARIZING_FILES,
                progress,
                (messenger as any).mode
            )
        }
    }

    protected getScheme(): string {
        return docScheme
    }

    protected handleGenerationComplete(messenger: DocMessenger, newFileInfo: NewFileInfo[]): void {
        messenger.sendDocProgress(this.tabID, DocGenerationStep.GENERATING_ARTIFACTS + 1, 100, (messenger as any).mode)
    }

    protected handleError(messenger: DocMessenger, detail?: string): Error {
        // eslint-disable-next-line unicorn/no-null
        messenger.sendUpdatePromptProgress(this.tabID, null)

        switch (true) {
            case detail?.includes('README_TOO_LARGE'): {
                return new ReadmeTooLargeError()
            }
            case detail?.includes('README_UPDATE_TOO_LARGE'): {
                return new ReadmeUpdateTooLargeError(this.codeGenerationRemainingIterationCount || 0)
            }
            case detail?.includes('WORKSPACE_TOO_LARGE'): {
                return new ContentLengthError()
            }
            case detail?.includes('WORKSPACE_EMPTY'): {
                return new WorkspaceEmptyError()
            }
            case detail?.includes('PROMPT_UNRELATED'): {
                return new PromptUnrelatedError(this.codeGenerationRemainingIterationCount || 0)
            }
            case detail?.includes('PROMPT_TOO_VAGUE'): {
                return new PromptTooVagueError(this.codeGenerationRemainingIterationCount || 0)
            }
            case detail?.includes('PROMPT_REFUSAL'): {
                return new PromptRefusalException(this.codeGenerationRemainingIterationCount || 0)
            }
            case detail?.includes('Guardrails'): {
                return new DocServiceError(i18n('AWS.amazonq.doc.error.docGen.default'), 'GuardrailsException')
            }
            case detail?.includes('EmptyPatch'): {
                if (detail?.includes('NO_CHANGE_REQUIRED')) {
                    return new NoChangeRequiredException()
                }
                return new DocServiceError(i18n('AWS.amazonq.doc.error.docGen.default'), 'EmptyPatchException')
            }
            case detail?.includes('Throttling'): {
                return new DocServiceError(i18n('AWS.amazonq.featureDev.error.throttling'), 'ThrottlingException')
            }
            default: {
                return new ToolkitError(i18n('AWS.amazonq.doc.error.docGen.default'), {
                    code: 'DocGenerationFailed',
                })
            }
        }
    }

    protected async startCodeGeneration(action: SessionStateAction, codeGenerationId: string): Promise<void> {
        ;(action.messenger as DocMessenger).sendDocProgress(
            this.tabID,
            DocGenerationStep.SUMMARIZING_FILES,
            0,
            action.mode as Mode
        )

        await this.config.proxyClient.startCodeGeneration(
            this.config.conversationId,
            this.config.uploadId,
            action.msg,
            Intent.DOC,
            codeGenerationId,
            undefined,
            action.folderPath ? { documentation: { type: 'README', scope: action.folderPath } } : undefined
        )
    }

    protected createNextState(
        config: SessionStateConfig,
        params: {
            filePaths: NewFileInfo[]
            deletedFiles: DeletedFileInfo[]
            references: CodeReference[]
            currentIteration: number
            remainingIterations?: number
            totalIterations?: number
            uploadHistory: UploadHistory
            tokenSource: vscode.CancellationTokenSource
            currentCodeGenerationId?: string
            codeGenerationId?: string
        }
    ): SessionState {
        return new DocPrepareCodeGenState(
            config,
            params.filePaths,
            params.deletedFiles,
            params.references,
            this.tabID,
            params.currentIteration,
            params.remainingIterations,
            params.totalIterations,
            params.uploadHistory,
            params.tokenSource,
            params.currentCodeGenerationId,
            params.codeGenerationId
        )
    }
}

export class DocPrepareCodeGenState extends BasePrepareCodeGenState {
    protected createNextState(config: SessionStateConfig): SessionState {
        return new DocCodeGenState(
            config,
            this.filePaths,
            this.deletedFiles,
            this.references,
            this.tabID,
            this.currentIteration,
            this.uploadHistory
        )
    }
}
