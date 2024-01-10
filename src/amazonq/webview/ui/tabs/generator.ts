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
    ])

    private tabInputPlaceholder: Map<TabType, string> = new Map([
        ['unknown', 'Ask a question or enter "/" for quick actions'],
        ['cwc', 'Ask a question or enter "/" for quick actions'],
        ['featuredev', 'Briefly describe a task or issue'],
    ])

    private tabWelcomeMessage: Map<TabType, string> = new Map([
        [
            'unknown',
            `Hi, I'm Amazon Q. I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions.`,
        ],
        [
            'cwc',
            `Hi, I'm Amazon Q. I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions.`,
        ],
        [
            'featuredev',
            `Welcome to /dev. 

I can help you create a plan or define an approach to development. I'll reference and make suggestions based on your open project.

_Coming soon_: I'll provide code suggestions to help you implement the plan.
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
        needFollowUp: boolean = true,
        taskName?: string
    ): MynahUIDataModel {
        return {
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
                      ...(needFollowUp
                          ? [
                                {
                                    type: ChatItemType.ANSWER,
                                    followUp: this.followUpsGenerator.generateWelcomeBlockForTab(tabType),
                                },
                            ]
                          : []),
                  ]
                : [],
        }
    }
}
