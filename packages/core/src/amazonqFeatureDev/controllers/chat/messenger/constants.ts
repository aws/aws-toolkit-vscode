/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type MessengerTypes = 'answer' | 'answer-part' | 'answer-stream' | 'system-prompt'

export const ErrorMessages = {
    technicalDifficulties: `I'm sorry, I'm having technical difficulties and can't continue at the moment. Please try again later, and share feedback to help me improve.`,
    monthlyLimitReached: `You've reached the monthly quota for the Amazon Q agent for software development. You can try again next month. For more information on usage limits, see the <a href="https://aws.amazon.com/q/developer/pricing/" target="_blank">Amazon Q Developer pricing page</a>.`,
    processingIssue: `Sorry, we encountered a problem when processing your request.`,
    approachPhase: {
        denyListedError: `I'm sorry, I'm having trouble generating a plan. Please try again.`,
        default: `I'm sorry, I ran into an issue while trying to approach the problem. Please try again.`,
    },
    codeGen: {
        denyListedError: `I'm sorry, I'm having trouble generating your code and can't continue at the moment. Please try again later, and share feedback to help me improve.`,
        default: `I'm sorry, I ran into an issue while trying to generate your code. Please try again.`,
    },
    tryAgain: `We're experiencing an issue on our side. Try again?`,
}

export const Placeholders = {
    chatInputDisabled: 'Chat input is disabled',
}
