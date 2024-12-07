/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickActionCommand, QuickActionCommandGroup } from '@aws/mynah-ui/dist/static'
import { TabType } from '../storages/tabsStorage'
import { MynahIcons } from '@aws/mynah-ui'

export interface QuickActionGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
    isScanEnabled: boolean
    isTestEnabled: boolean
    isDocEnabled: boolean
    disableCommands?: string[]
}

export class QuickActionGenerator {
    public isFeatureDevEnabled: boolean
    private isGumbyEnabled: boolean
    private isScanEnabled: boolean
    private isTestEnabled: boolean
    private isDocEnabled: boolean
    private disabledCommands: string[]

    constructor(props: QuickActionGeneratorProps) {
        this.isFeatureDevEnabled = props.isFeatureDevEnabled
        this.isGumbyEnabled = props.isGumbyEnabled
        this.isScanEnabled = props.isScanEnabled
        this.isTestEnabled = props.isTestEnabled
        this.isDocEnabled = props.isDocEnabled
        this.disabledCommands = props.disableCommands ?? []
    }

    public generateForTab(tabType: TabType): QuickActionCommandGroup[] {
        // agentWalkthrough is static and doesn't have any quick actions
        if (tabType === 'agentWalkthrough') {
            return []
        }

        // TODO: Update acc to UX
        const quickActionCommands = [
            {
                groupName: `Q Developer agentic capabilities`,
                commands: [
                    ...(this.isFeatureDevEnabled && !this.disabledCommands.includes('/dev')
                        ? [
                              {
                                  command: '/dev',
                                  icon: MynahIcons.CODE_BLOCK,
                                  placeholder: 'Describe your task or issue in as much detail as possible',
                                  description: 'Generate code to make a change in your project',
                              },
                          ]
                        : []),
                    ...(this.isTestEnabled && !this.disabledCommands.includes('/test')
                        ? [
                              {
                                  command: '/test',
                                  icon: MynahIcons.CHECK_LIST,
                                  placeholder: 'Specify a function(s) in the current file (optional)',
                                  description: 'Generate unit tests (python & java) for selected code',
                              },
                          ]
                        : []),
                    ...(this.isScanEnabled && !this.disabledCommands.includes('/review')
                        ? [
                              {
                                  command: '/review',
                                  icon: MynahIcons.BUG,
                                  description: 'Identify and fix code issues before committing',
                              },
                          ]
                        : []),
                    ...(this.isDocEnabled && !this.disabledCommands.includes('/doc')
                        ? [
                              {
                                  command: '/doc',
                                  icon: MynahIcons.FILE,
                                  description: 'Generate documentation',
                              },
                          ]
                        : []),
                    ...(this.isGumbyEnabled && !this.disabledCommands.includes('/transform')
                        ? [
                              {
                                  command: '/transform',
                                  description: 'Transform your Java 8, 11, or 17 Maven projects',
                                  icon: MynahIcons.TRANSFORM,
                              },
                          ]
                        : []),
                ],
            },
            {
                groupName: 'Quick Actions',
                commands: [
                    {
                        command: '/help',
                        icon: MynahIcons.HELP,
                        description: 'Learn more about Amazon Q',
                    },
                    {
                        command: '/clear',
                        icon: MynahIcons.TRASH,
                        description: 'Clear this session',
                    },
                ],
            },
        ].filter((section) => section.commands.length > 0)

        const commandUnavailability: Record<
            Exclude<TabType, 'agentWalkthrough'>,
            {
                description: string
                unavailableItems: string[]
            }
        > = {
            cwc: {
                description: '',
                unavailableItems: [],
            },
            featuredev: {
                description: "This command isn't available in /dev",
                unavailableItems: ['/help', '/clear'],
            },
            review: {
                description: "This command isn't available in /review",
                unavailableItems: ['/help', '/clear'],
            },
            gumby: {
                description: "This command isn't available in /transform",
                unavailableItems: ['/dev', '/test', '/doc', '/review', '/help', '/clear'],
            },
            testgen: {
                description: "This command isn't available in /test",
                unavailableItems: ['/help', '/clear'],
            },
            doc: {
                description: "This command isn't available in /doc",
                unavailableItems: ['/help', '/clear'],
            },
            welcome: {
                description: '',
                unavailableItems: ['/clear'],
            },
            unknown: {
                description: '',
                unavailableItems: [],
            },
        }

        return quickActionCommands.map((commandGroup) => {
            return {
                groupName: commandGroup.groupName,
                commands: commandGroup.commands.map((commandItem: QuickActionCommand) => {
                    const commandNotAvailable = commandUnavailability[tabType].unavailableItems.includes(
                        commandItem.command
                    )
                    return {
                        ...commandItem,
                        disabled: commandNotAvailable,
                        description: commandNotAvailable
                            ? commandUnavailability[tabType].description
                            : commandItem.description,
                    }
                }) as QuickActionCommand[],
            }
        }) as QuickActionCommandGroup[]
    }
}
