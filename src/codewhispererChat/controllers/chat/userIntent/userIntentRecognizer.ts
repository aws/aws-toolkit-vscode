/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserIntent } from '@amzn/codewhisperer-streaming'
import { EditorContextCommand } from '../../../commands/registerCommands'
import { PromptMessage } from '../model'

export class UserIntentRecognizer {
    public getUserIntentFromContextMenuCommand(command: EditorContextCommand): UserIntent | undefined {
        switch (command.type) {
            case 'aws.awsq.explainCode':
                return UserIntent.EXPLAIN_CODE_SELECTION
            case 'aws.awsq.refactorCode':
                return UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION
            case 'aws.awsq.fixCode':
                return UserIntent.APPLY_COMMON_BEST_PRACTICES
            case 'aws.awsq.optimizeCode':
                return UserIntent.IMPROVE_CODE
            default:
                return undefined
        }
    }

    public getUserIntentFromPromptChatMessage(prompt: PromptMessage): UserIntent | undefined {
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
        }
        return undefined
    }
}
