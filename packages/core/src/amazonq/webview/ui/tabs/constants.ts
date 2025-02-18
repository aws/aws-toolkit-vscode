/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TabType } from '../storages/tabsStorage'
import { QuickActionCommandGroup } from '@aws/mynah-ui'
import { userGuideURL } from '../texts/constants'

export type TabTypeData = {
    title: string
    placeholder: string
    welcome: string
    contextCommands?: QuickActionCommandGroup[]
}

export const createPromptCommand = 'Create a new prompt'

export const workspaceCommand: QuickActionCommandGroup = {
    groupName: 'Mention code',
    commands: [
        {
            command: '@workspace',
            description: 'Reference all code in workspace.',
        },
    ],
}

const commonTabData: TabTypeData = {
    title: 'Chat',
    placeholder: 'Ask a question or enter "/" for quick actions',
    welcome: `Hi, I'm Amazon Q. I can answer your software development questions.
  Ask me to explain, debug, or optimize your code.
  You can enter \`/\` to see a list of quick actions. Add @workspace to the beginning of your message to include your entire workspace as context.`,
    contextCommands: [workspaceCommand],
}

export const TabTypeDataMap: Record<Exclude<TabType, 'agentWalkthrough' | 'welcome'>, TabTypeData> = {
    unknown: commonTabData,
    cwc: commonTabData,
    featuredev: {
        title: 'Q - Dev',
        placeholder: 'Describe your task or issue in as much detail as possible',
        welcome: `I can generate code to accomplish a task or resolve an issue. 

After you provide a description, I will: 
1. Generate code based on your description and the code in your workspace
2. Provide a list of suggestions for you to review and add to your workspace 
3. If needed, iterate based on your feedback 

To learn more, visit the [User Guide](${userGuideURL}).`,
    },
    gumby: {
        title: 'Q - Code Transformation',
        placeholder: 'Open a new tab to chat with Q',
        welcome: 'Welcome to Code Transformation!',
    },
    review: {
        title: 'Q - Review',
        placeholder: `Ask a question or enter "/" for quick actions`,
        welcome: `Welcome to code reviews. I can help you identify code issues and provide suggested fixes for the active file or workspace you have opened in your IDE.`,
    },
    testgen: {
        title: 'Q - Test',
        placeholder: `Waiting on your inputs...`,
        welcome: `Welcome to unit test generation. I can help you generate unit tests for your active file.`,
    },
    doc: {
        title: 'Q - Doc Generation',
        placeholder: 'Ask Amazon Q to generate documentation for your project',
        welcome: `Welcome to doc generation!

I can help generate documentation for your code. To get started, choose what type of doc update you'd like to make.`,
    },
}
