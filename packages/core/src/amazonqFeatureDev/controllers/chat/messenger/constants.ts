/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type MessengerTypes = 'answer' | 'answer-part' | 'answer-stream' | 'system-prompt'

export const ErrorMessages = {
    technicalDifficulties: `I'm sorry, I'm having technical difficulties and can't continue at the moment. Please try again later, and share feedback to help me improve.`,
    monthlyLimitReached: `Sorry, you have reached the monthly limit for feature development. You can try again next month.`,
    processingIssue: `Sorry, we encountered a problem when processing your request.`,
    tryAgain: `Sorry, we're experiencing an issue on our side. Would you like to try again?`,
}

export const Placeholders = {
    chatInputDisabled: 'Chat input is disabled',
}
