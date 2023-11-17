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
        ['featuredev', 'Q - Dev'],
    ])

    private tabInputPlaceholder: Map<TabType, string> = new Map([
        ['unknown', 'Ask a question or enter "/" for quick commands'],
        ['cwc', 'Ask a question or enter "/" for quick commands'],
        ['featuredev', 'Briefly describe a task or issue'],
    ])

    private tabWelcomeMessage: Map<TabType, (name?: string) => string> = new Map([
        [
            'unknown',
            () => `Hi, I am Amazon Q. I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions.`,
        ],
        [
            'cwc',
            () => `Hi, I am Amazon Q (Preview). I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions.`,
        ],
        [
            'featuredev',
            (name?: string) => `Welcome to ${name}. 

Here I can provide code suggestions across files in your current project by looking at /src, if it exists.

Before I begin generating code, let's agree on an implementation plan. What change would you like to make?
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
            promptInputInfo:
                'Amazon Q may produce inaccurate information. Verify all provided code or information before using it in any environment or workload.',
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
