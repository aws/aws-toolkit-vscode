/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahUIDataModel } from '@aws/mynah-ui-chat'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'

export interface TabDataGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    private quickActionsGenerator: QuickActionGenerator

    private tabTitle: Map<TabType, string> = new Map([
        ['unknown', 'Chat'],
        ['cwc', 'Chat'],
        ['featuredev', 'Q - Task'],
    ])

    private tabInputPlaceholder: Map<TabType, string> = new Map([
        ['unknown', 'Ask a question or enter "/" for actions'],
        ['cwc', 'Ask a question or enter "/" for actions'],
        ['featuredev', 'What problem do you want to fix?'],
    ])

    private tabWelcomeMessage: Map<TabType, (name?: string) => string> = new Map([
        [
            'unknown',
            () => `Hi, I am Amazon Q (Preview). I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions.`,
        ],
        [
            'featuredev',
            (name?: string) => `Welcome to ${name}. 

Here I can provide cross-file code suggestions to implement a software task in your current project (looking at /src if it exists). 

Before I begin generating code, let's agree on an implementation plan. What problem are you looking to solve?
`,
        ],
    ])

    constructor(props: TabDataGeneratorProps) {
        this.followUpsGenerator = new FollowUpGenerator()
        this.quickActionsGenerator = new QuickActionGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isGumbyEnabled: props.isGumbyEnabled,
        })
    }

    public getTabData(
        tabType: TabType,
        needWelcomeMessages: boolean,
        taskName?: string,
        commandName?: string
    ): MynahUIDataModel {
        return {
            tabTitle: taskName ?? this.tabTitle.get(tabType),
            quickActionCommands: this.quickActionsGenerator.generateForTab(tabType),
            promptInputPlaceholder: this.tabInputPlaceholder.get(tabType),
            chatItems: needWelcomeMessages
                ? [
                      {
                          type: ChatItemType.ANSWER,
                          body: this.tabWelcomeMessage.get(tabType)?.(commandName),
                      },
                      {
                          type: ChatItemType.ANSWER,
                          followUp: this.followUpsGenerator.generateWelcomeBlockForTab(tabType),
                      },
                  ]
                : [],
        }
    }
}
