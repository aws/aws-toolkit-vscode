/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    DocGenerationEvent,
    DocGenerationFolderLevel,
    DocGenerationInteractionType,
    DocGenerationUserDecision,
} from '../../codewhisperer/client/codewhispereruserclient'
import { getLogger } from '../../shared'

export class DocGenerationTask {
    // Telemetry fields
    public conversationId?: string
    public numberOfAddChars?: number
    public numberOfAddLines?: number
    public numberOfAddFiles?: number
    public userDecision?: DocGenerationUserDecision
    public interactionType?: DocGenerationInteractionType
    public userIdentity?: string
    public numberOfNavigation = 0
    public folderLevel?: DocGenerationFolderLevel

    constructor(conversationId?: string) {
        this.conversationId = conversationId
    }

    public docGenerationEventBase() {
        const undefinedProps = Object.entries(this)
            .filter(([key, value]) => value === undefined)
            .map(([key]) => key)

        if (undefinedProps.length > 0) {
            getLogger().debug(`DocGenerationEvent has undefined properties: ${undefinedProps.join(', ')}`)
        }
        const event: DocGenerationEvent = {
            conversationId: this.conversationId ?? '',
            numberOfAddChars: this.numberOfAddChars,
            numberOfAddLines: this.numberOfAddLines,
            numberOfAddFiles: this.numberOfAddFiles,
            userDecision: this.userDecision,
            interactionType: this.interactionType,
            userIdentity: this.userIdentity,
            numberOfNavigation: this.numberOfNavigation,
            folderLevel: this.folderLevel,
        }
        return event
    }

    public reset() {
        this.conversationId = undefined
        this.numberOfAddChars = undefined
        this.numberOfAddLines = undefined
        this.numberOfAddFiles = undefined
        this.userDecision = undefined
        this.interactionType = undefined
        this.userIdentity = undefined
        this.numberOfNavigation = 0
        this.folderLevel = undefined
    }
}
