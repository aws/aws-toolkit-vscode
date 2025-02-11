/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahUIDataModel, QuickActionCommandGroup } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'
import { TabTypeDataMap } from './constants'
import { agentWalkthroughDataModel } from '../walkthrough/agent'
import { FeatureContext } from '../../../../shared/featureConfig'

export interface TabDataGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    isTestEnabled: boolean
    isDocEnabled: boolean
    disabledCommands?: string[]
    commandHighlight?: FeatureContext
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    public quickActionsGenerator: QuickActionGenerator
    private highlightCommand?: FeatureContext

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
        this.highlightCommand = props.commandHighlight
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
            contextCommands: this.getContextCommands(tabType),
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

    private getContextCommands(tabType: TabType): QuickActionCommandGroup[] | undefined {
        if (tabType === 'agentWalkthrough' || tabType === 'welcome') {
            return
        }

        const commandName = this.highlightCommand?.value.stringValue
        if (commandName === undefined || commandName === '') {
            return TabTypeDataMap[tabType].contextCommands
        } else {
            const commandHighlight: QuickActionCommandGroup = {
                groupName: 'Additional Commands',
                commands: [
                    {
                        command: commandName,
                        description: this.highlightCommand?.variation,
                    },
                ],
            }

            const contextCommands = TabTypeDataMap[tabType].contextCommands
            if (contextCommands === undefined) {
                return [commandHighlight]
            } else {
                return [...contextCommands, commandHighlight]
            }
        }
    }
}
