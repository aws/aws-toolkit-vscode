/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserIntent } from '@amzn/codewhisperer-streaming'
import { EditorContextCommand } from '../../../commands/registerCommands'
import { PromptMessage } from '../model'
import { Auth } from '../../../../auth/auth'

export class UserIntentRecognizer {
    public getFromContextMenuCommand(command: EditorContextCommand): UserIntent | undefined {
        switch (command.type) {
            case 'aws.amazonq.explainCode':
                return UserIntent.EXPLAIN_CODE_SELECTION
            case 'aws.amazonq.refactorCode':
                return UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
            case 'aws.amazonq.fixCode':
                return UserIntent.APPLY_COMMON_BEST_PRACTICES
            case 'aws.amazonq.optimizeCode':
                return UserIntent.IMPROVE_CODE
            case 'aws.amazonq.generateUnitTests':
                return UserIntent.GENERATE_UNIT_TESTS
            default:
                return undefined
        }
    }

    public getFromPromptChatMessage(prompt: PromptMessage): UserIntent | undefined {
        if (prompt.message === undefined) {
            return undefined
        }

        if (prompt.message.startsWith('Explain')) {
            return UserIntent.EXPLAIN_CODE_SELECTION
        } else if (prompt.message.startsWith('Refactor')) {
            return UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
        } else if (prompt.message.startsWith('Fix')) {
            return UserIntent.APPLY_COMMON_BEST_PRACTICES
        } else if (prompt.message.startsWith('Optimize')) {
            return UserIntent.IMPROVE_CODE
        } else if (prompt.message.startsWith('Generate unit tests') && Auth.instance.isInternalAmazonUser()) {
            return UserIntent.GENERATE_UNIT_TESTS
        }
        return undefined
    }
}
