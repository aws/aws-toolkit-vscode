/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from 'stream'
import { getLogger } from '../../shared/logger/logger'
import { Messenger } from '../controllers/chat/messenger/messenger'
import { ToolUse } from '@amzn/codewhisperer-streaming'
import { CommandValidation } from './executeBash'
import { Change } from 'diff'

/**
 * A writable stream that feeds each chunk/line to the chat UI.
 * Used for streaming tool output (like bash execution) to the chat interface.
 */
export class ChatStream extends Writable {
    private accumulatedLogs = ''

    public constructor(
        private readonly messenger: Messenger,
        private readonly tabID: string,
        private readonly triggerID: string,
        private readonly toolUse: ToolUse | undefined,
        private readonly validation: CommandValidation,
        private readonly changeList?: Change[],
        private readonly logger = getLogger('chatStream')
    ) {
        super()
        this.logger.debug(`ChatStream created for tabID: ${tabID}, triggerID: ${triggerID}`)
        this.messenger.sendInitalStream(tabID, triggerID, undefined)
    }

    override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const text = chunk.toString()
        this.accumulatedLogs += text
        this.logger.debug(`ChatStream received chunk: ${text}`)
        this.messenger.sendPartialToolLog(
            this.accumulatedLogs,
            this.tabID,
            this.triggerID,
            this.toolUse,
            this.validation,
            this.changeList
        )
        callback()
    }

    override _final(callback: (error?: Error | null) => void): void {
        callback()
    }
}
