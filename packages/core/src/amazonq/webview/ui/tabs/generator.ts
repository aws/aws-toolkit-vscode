/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahUIDataModel } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'
import { TabTypeDataMap } from './constants'
import { agentWalkthroughDataModel } from '../walkthrough/agent'

export interface TabDataGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    isTestEnabled: boolean
    isDocEnabled: boolean
    disabledCommands?: string[]
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    public quickActionsGenerator: QuickActionGenerator

    constructor(props: TabDataGeneratorProps) {
        this.followUpsGenerator = new FollowUpGenerator()
        this.quickActionsGenerator = new QuickActionGenerator({
            isFeatureDevEnabled: props.isFeatureDevEnabled,
            isGumbyEnabled: props.isGumbyEnabled,
            isScanEnabled: props.isScanEnabled,
            isTestEnabled: props.isTestEnabled,
            isDocEnabled: props.isDocEnabled,
            disableCommands: props.disabledCommands,
        })
    }

    public getTabData(tabType: TabType, needWelcomeMessages: boolean, taskName?: string): MynahUIDataModel {
        if (tabType === 'agentWalkthrough') {
            return agentWalkthroughDataModel
        }

        if (tabType === 'welcome') {
            return {}
        }

        const tabData: MynahUIDataModel = {
            tabTitle: taskName ?? TabTypeDataMap[tabType].title,
            promptInputInfo:
                'Amazon Q Developer uses generative AI. You may need to verify responses. See the [AWS Responsible AI Policy](https://aws.amazon.com/machine-learning/responsible-ai/policy/).',
            quickActionCommands: this.quickActionsGenerator.generateForTab(tabType),
            promptInputPlaceholder: TabTypeDataMap[tabType].placeholder,
            contextCommands: TabTypeDataMap[tabType].contextCommands,
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
