/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TabType } from '../storages/tabsStorage'

export type TabTypeData = {
    title: string
    placeholder: string
    welcome: string
}

const commonTabData: TabTypeData = {
    title: 'Chat',
    placeholder: 'Ask a question or enter "/" for quick actions',
    welcome: `Hi, I'm Amazon Q. I can answer your software development questions.
  Ask me to explain, debug, or optimize your code.
  You can enter \`/\` to see a list of quick actions. Add @workspace to beginning of your message to include your entire workspace as context.`,
}

export const TabTypeDataMap: Record<TabType, TabTypeData> = {
    unknown: commonTabData,
    cwc: commonTabData,
    featuredev: {
        title: 'Q - Dev',
        placeholder: 'Describe your task or issue in as much detail as possible',
        welcome: `Hi! I'm the Amazon Q Developer Agent for software development. 
        
I can generate code to implement new functionality across your workspace. To get started, describe the task you're trying to accomplish, and I'll generate code to implement it. If you want to make changes to the code, you can tell me what to improve and I'll generate new code based on your feedback. 

What would you like to work on?`,
    },
    gumby: {
        title: 'Q - Code Transformation',
        placeholder: 'Open a new tab to chat with Q',
        welcome: `Welcome to Code Transformation!

I can help you upgrade your Java 8 and 11 codebases to Java 17.`,
    },
}
