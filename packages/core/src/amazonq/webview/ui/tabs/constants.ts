/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TabType } from '../storages/tabsStorage'
import { QuickActionCommandGroup } from '@aws/mynah-ui'

const qChatIntroMessage = `Hi, I'm Amazon Q. I can answer your software development questions.
  Ask me to explain, debug, or optimize your code.
  You can enter \`/\` to see a list of quick actions. Use \`@\` to add saved prompts, files, folders, or your entire workspace as context.`

/**
 * The below intro message is for SageMaker Unified Studio(SMUS) customers only.
 * With upcoming release of SMUS, only Q Free Tier is being supported hence the requirement to show this messaging to customers.
 * Once Pro Tier is supported with SMUS, the below message will be removed and is only added for the interim
 */
export const qChatIntroMessageForSMUS = `Hi, I'm Amazon Q. I can answer your software development questions.\n\
  Ask me to explain, debug, or optimize your code.\n\
  You can enter \`/\` to see a list of quick actions. Use \`@\` to add saved prompts, files, folders, or your entire workspace as context.
  You are now using Q free tier.\n\
  `

export type TabTypeData = {
    title: string
    placeholder: string
    welcome: string
    contextCommands?: QuickActionCommandGroup[]
}

export const workspaceCommand: QuickActionCommandGroup = {
    groupName: 'Mention code',
    commands: [
        {
            command: '@workspace',
            description: 'Reference all code in workspace.',
        },
    ],
}

export const commonTabData: TabTypeData = {
    title: 'Chat',
    placeholder: 'Ask a question. Use @ to add context, / for quick actions',
    welcome: qChatIntroMessage,
    contextCommands: [workspaceCommand],
}

export const TabTypeDataMap: Record<Exclude<TabType, 'agentWalkthrough' | 'welcome'>, TabTypeData> = {
    unknown: commonTabData,
    cwc: commonTabData,
    gumby: {
        title: 'Q - Code Transformation',
        placeholder: 'Open a new tab to chat with Q',
        welcome:
            'Welcome to Code Transformation! **You can also run transformations from the command line. To install the tool, see the [documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/run-CLI-transformations.html).**',
    },
    review: {
        title: 'Q - Review',
        placeholder: `Ask a question or enter "/" for quick actions`,
        welcome: `Welcome to code reviews. I can help you identify code issues and provide suggested fixes for the active file or workspace you have opened in your IDE.`,
    },
}
