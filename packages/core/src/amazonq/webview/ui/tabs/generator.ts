/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItem, ChatItemType, MynahUIDataModel, QuickActionCommandGroup } from '@aws/mynah-ui'
import { TabType } from '../storages/tabsStorage'
import { FollowUpGenerator } from '../followUps/generator'
import { QuickActionGenerator } from '../quickActions/generator'
import { qChatIntroMessageForSMUS, TabTypeDataMap } from './constants'
import { agentWalkthroughDataModel } from '../walkthrough/agent'
import { FeatureContext } from '../../../../shared/featureConfig'
import { RegionProfile } from '../../../../codewhisperer/models/model'

export interface TabDataGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    isTestEnabled: boolean
    isDocEnabled: boolean
    disabledCommands?: string[]
    commandHighlight?: FeatureContext
    regionProfile?: RegionProfile
}

export class TabDataGenerator {
    private followUpsGenerator: FollowUpGenerator
    public quickActionsGenerator: QuickActionGenerator
    private highlightCommand?: FeatureContext
    private regionProfile?: RegionProfile

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
        this.regionProfile = props.regionProfile
    }

    public getTabData(
        tabType: TabType,
        needWelcomeMessages: boolean,
        taskName?: string,
        isSMUS?: boolean
    ): MynahUIDataModel {
        if (tabType === 'agentWalkthrough') {
            return agentWalkthroughDataModel
        }

        if (tabType === 'welcome') {
            return {}
        }
        const programmerModeCard: ChatItem | undefined = {
            type: ChatItemType.ANSWER,
            title: 'NEW FEATURE',
            header: {
                icon: 'code-block',
                iconStatus: 'primary',
                body: '## Pair programmer',
            },
            fullWidth: true,
            canBeDismissed: true,
            body: 'Amazon Q Developer chat can now write code and run shell commands on your behalf. Disable Pair Programmer if you prefer a read-only experience.',
        }

        const regionProfileCard: ChatItem | undefined =
            this.regionProfile === undefined
                ? undefined
                : {
                      type: ChatItemType.ANSWER,
                      body: `You are using the ${this.regionProfile?.name} profile for this chat period`,
                      status: 'info',
                      messageId: 'regionProfile',
                  }

        const welcomeMessage = `Hi! I'm Amazon Q.

You can ask me to:
• Create new projects and files
• Make changes to your codebase
• Explain how to do things

Enter \`/\` to view quick actions. Use \`@\` to add saved prompts, files, folders, or your entire workspace as context.`

        const tabData: MynahUIDataModel = {
            tabTitle: taskName ?? TabTypeDataMap[tabType].title,
            promptInputInfo:
                'Amazon Q Developer uses generative AI. You may need to verify responses. See the [AWS Responsible AI Policy](https://aws.amazon.com/machine-learning/responsible-ai/policy/).',
            quickActionCommands: this.quickActionsGenerator.generateForTab(tabType),
            promptInputPlaceholder: TabTypeDataMap[tabType].placeholder,
            contextCommands: this.getContextCommands(tabType),
            chatItems: needWelcomeMessages
                ? [
                      ...(tabType === 'cwc' || tabType === 'unknown' ? [programmerModeCard] : []),
                      ...(regionProfileCard ? [regionProfileCard] : []),
                      {
                          type: ChatItemType.ANSWER,
                          body: isSMUS ? qChatIntroMessageForSMUS : welcomeMessage,
                      },
                      {
                          type: ChatItemType.ANSWER,
                          followUp: this.followUpsGenerator.generateWelcomeBlockForTab(tabType),
                      },
                  ]
                : [...(regionProfileCard ? [regionProfileCard] : [])],
            promptInputOptions:
                tabType === 'cwc' || tabType === 'unknown'
                    ? [
                          {
                              type: 'switch',
                              id: 'pair-programmer-mode',
                              tooltip: 'Enable or disable pair programmer',
                              value: 'true',
                              icon: 'code-block',
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
