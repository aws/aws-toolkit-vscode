/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DocFolderLevel,
    DocInteractionType,
    DocUserDecision,
    DocV2AcceptanceEvent,
    DocV2GenerationEvent,
} from '../../codewhisperer/client/codewhispereruserclient'
import { getLogger } from '../../shared/logger/logger'

export class DocGenerationTask {
    // Telemetry fields
    public conversationId?: string
    public numberOfAddedChars?: number
    public numberOfAddedLines?: number
    public numberOfAddedFiles?: number
    public numberOfGeneratedChars?: number
    public numberOfGeneratedLines?: number
    public numberOfGeneratedFiles?: number
    public userDecision?: DocUserDecision
    public interactionType?: DocInteractionType
    public numberOfNavigations = 0
    public folderLevel: DocFolderLevel = 'ENTIRE_WORKSPACE'

    constructor(conversationId?: string) {
        this.conversationId = conversationId
    }

    public docGenerationEventBase() {
        const undefinedProps = Object.entries(this)
            .filter(([key, value]) => value === undefined)
            .map(([key]) => key)

        if (undefinedProps.length > 0) {
            getLogger().debug(`DocV2GenerationEvent has undefined properties: ${undefinedProps.join(', ')}`)
        }
        const event: DocV2GenerationEvent = {
            conversationId: this.conversationId ?? '',
            numberOfGeneratedChars: this.numberOfGeneratedChars ?? 0,
            numberOfGeneratedLines: this.numberOfGeneratedLines ?? 0,
            numberOfGeneratedFiles: this.numberOfGeneratedFiles ?? 0,
            interactionType: this.interactionType,
            numberOfNavigations: this.numberOfNavigations,
            folderLevel: this.folderLevel,
        }
        return event
    }

    public docAcceptanceEventBase() {
        const undefinedProps = Object.entries(this)
            .filter(([key, value]) => value === undefined)
            .map(([key]) => key)

        if (undefinedProps.length > 0) {
            getLogger().debug(`DocV2AcceptanceEvent has undefined properties: ${undefinedProps.join(', ')}`)
        }
        const event: DocV2AcceptanceEvent = {
            conversationId: this.conversationId ?? '',
            numberOfAddedChars: this.numberOfAddedChars ?? 0,
            numberOfAddedLines: this.numberOfAddedLines ?? 0,
            numberOfAddedFiles: this.numberOfAddedFiles ?? 0,
            userDecision: this.userDecision ?? 'ACCEPTED',
            interactionType: this.interactionType ?? 'GENERATE_README',
            numberOfNavigations: this.numberOfNavigations ?? 0,
            folderLevel: this.folderLevel,
        }
        return event
    }

    public reset() {
        this.conversationId = undefined
        this.numberOfAddedChars = undefined
        this.numberOfAddedLines = undefined
        this.numberOfAddedFiles = undefined
        this.numberOfGeneratedChars = undefined
        this.numberOfGeneratedLines = undefined
        this.numberOfGeneratedFiles = undefined
        this.userDecision = undefined
        this.interactionType = undefined
        this.numberOfNavigations = 0
        this.folderLevel = 'ENTIRE_WORKSPACE'
    }
}
