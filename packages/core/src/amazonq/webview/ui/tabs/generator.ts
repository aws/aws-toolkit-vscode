/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahUIDataModel } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'
import { TabTypeDataMap } from './constants'

export interface TabDataGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    public quickActionsGenerator: QuickActionGenerator

    constructor(props: TabDataGeneratorProps) {
        this.followUpsGenerator = new FollowUpGenerator()
        this.quickActionsGenerator = new QuickActionGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isGumbyEnabled: props.isGumbyEnabled,
        })
    }

    public getTabData(tabType: TabType, needWelcomeMessages: boolean, taskName?: string): MynahUIDataModel {
        const tabData: MynahUIDataModel = {
            tabTitle: taskName ?? TabTypeDataMap[tabType].title,
            promptInputInfo:
                'Amazon Q Developer uses generative AI. You may need to verify responses. See the [AWS Responsible AI Policy](https://aws.amazon.com/machine-learning/responsible-ai/policy/).',
            quickActionCommands: this.quickActionsGenerator.generateForTab(tabType),
            promptInputPlaceholder: TabTypeDataMap[tabType].placeholder,
            contextCommands: [
                {
                    groupName: 'Mention code',
                    commands: [
                        {
                            command: '@workspace',
                            description: '(BETA) Reference all code in workspace.',
                        },
                    ],
                },
            ],
            chatItems: needWelcomeMessages
                ? [
                      {
                          type: ChatItemType.ANSWER,
                          body: TabTypeDataMap[tabType].welcome,
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
