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
  You can enter \`/\` to see a list of quick actions.`,
}

export const TabTypeDataMap: Record<TabType, TabTypeData> = {
    unknown: commonTabData,
    cwc: commonTabData,
    featuredev: {
        title: 'Q - Dev',
        placeholder: 'Describe your task or issue in as much detail as possible',
        welcome: `Hi, I'm the Amazon Q Developer Agent for software development.

    I can generate code to implement new functionality across your workspace. We'll start by discussing an implementation plan, and then we can review and regenerate code based on your feedback.

    To get started, describe the task you are trying to accomplish.`,
    },
    gumby: {
        title: 'Q - Code Transformation',
        placeholder: 'Open a new tab to chat with Q',
        welcome: `Welcome to Code Transformation!

    I can help you upgrade your Java 8 and 11 codebases to Java 17.`,
    },
}
