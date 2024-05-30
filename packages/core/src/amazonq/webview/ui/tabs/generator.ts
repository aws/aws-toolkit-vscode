/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahUIDataModel } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'

export interface TabDataGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    public quickActionsGenerator: QuickActionGenerator

    private tabTitle: Map<TabType, string> = new Map([
        ['unknown', 'Chat'],
        ['cwc', 'Chat'],
        ['featuredev', 'Q - Dev'],
        ['gumby', 'Q - Code Transformation'],
    ])

    private tabInputPlaceholder: Map<TabType, string> = new Map([
        ['unknown', 'Ask a question or enter "/" for quick actions'],
        ['cwc', 'Ask a question or enter "/" for quick actions'],
        ['featuredev', 'Describe your task or issue in as much detail as possible'],
        ['gumby', 'Open a new tab to chat with Q'],
    ])

    private tabWelcomeMessage: Map<TabType, string> = new Map([
        [
            'unknown',
            `Hi, I'm Amazon Q. I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions. Add @workspace or @ws at the beginning of your message to enhance Q response with entire workspace files`,
        ],
        [
            'cwc',
            `Hi, I'm Amazon Q. I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions. Add @workspace or @ws at the beginning of your message to enhance Q response with entire workspace files`,
        ],
        [
            'featuredev',
            `Welcome to feature development.

I can generate code to implement new functionality across your workspace. We'll start by discussing an implementation plan, and then we can review and regenerate code based on your feedback. 
            
To get started, describe the task you are trying to accomplish.
`,
        ],
        [
            'gumby',
            `Welcome to Code Transformation!

I can help you upgrade your Java 8 and 11 codebases to Java 17.`,
        ],
    ])

    constructor(props: TabDataGeneratorProps) {
        this.followUpsGenerator = new FollowUpGenerator()
        this.quickActionsGenerator = new QuickActionGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isGumbyEnabled: props.isGumbyEnabled,
        })
    }

    public getTabData(tabType: TabType, needWelcomeMessages: boolean, taskName?: string): MynahUIDataModel {
        const tabData: MynahUIDataModel = {
            tabTitle: taskName ?? this.tabTitle.get(tabType),
            promptInputInfo:
                'Use of Amazon Q is subject to the [AWS Responsible AI Policy](https://aws.amazon.com/machine-learning/responsible-ai/policy/).',
            quickActionCommands: this.quickActionsGenerator.generateForTab(tabType),
            promptInputPlaceholder: this.tabInputPlaceholder.get(tabType),
            chatItems: needWelcomeMessages
                ? [
                      {
                          type: ChatItemType.ANSWER,
                          body: this.tabWelcomeMessage.get(tabType),
                      },
                      {
                          type: ChatItemType.ANSWER,
                          followUp: this.followUpsGenerator.generateWelcomeBlockForTab(tabType),
                      },
                  ]
                : [],
        }
        return tabData
    }
}
