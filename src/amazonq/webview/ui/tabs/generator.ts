/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahUIDataModel } from '@aws/mynah-ui-chat'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'

export interface TabDataGeneratorProps {
    isWeaverbirdEnabled: boolean
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    private quickActionsGenerator: QuickActionGenerator

    private tabTitle: Map<TabType, string> = new Map([
        ['unknown', 'Chat'],
        ['cwc', 'Chat'],
        ['wb', 'Q - Task'],
    ])

    private tabInputPlaceholder: Map<TabType, string> = new Map([
        ['unknown', 'Ask a question or "/" for capabilities'],
        ['cwc', 'Ask a question or "/" for capabilities'],
        ['wb', 'What problem do you want to fix?'],
    ])

    private tabWelcomeMessage: Map<TabType, string> = new Map([
        [
            'unknown',
            `Hi, I am Amazon Q. I can answer your software development questions. 
        Ask me to explain, debug, or optimize your code. 
        You can enter \`/\` to see a list of quick actions.`,
        ],
        [
            'wb',
            `Welcome to /dev. 

        Here I can provide cross-file code suggestions to implement a software task in your current project (looking at /src if it exists). 
        
        Before I begin generating code, let's agree on an implementation plan. What problem are you looking to solve?
        `,
        ],
    ])

    constructor(props: TabDataGeneratorProps) {
        this.followUpsGenerator = new FollowUpGenerator({ isWeaverbirdEnabled: props.isWeaverbirdEnabled })
        this.quickActionsGenerator = new QuickActionGenerator({ isWeaverbirdEnabled: props.isWeaverbirdEnabled })
    }

    public getTabData(tabType: TabType, needWelcomeMessages: boolean): MynahUIDataModel {
        return {
            tabTitle: this.tabTitle.get(tabType),
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
    }
}
