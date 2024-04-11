/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickActionCommand, QuickActionCommandGroup } from '@aws/mynah-ui/dist/static'
import { TabType } from '../storages/tabsStorage'

export interface QuickActionGeneratorProps {
    isFeatureDevEnabled: boolean
    isGumbyEnabled: boolean
}

export class QuickActionGenerator {
    public isFeatureDevEnabled: boolean
    private isGumbyEnabled: boolean

    constructor(props: QuickActionGeneratorProps) {
        this.isFeatureDevEnabled = props.isFeatureDevEnabled
        this.isGumbyEnabled = props.isGumbyEnabled
    }

    public generateForTab(tabType: TabType): QuickActionCommandGroup[] {
        const quickActionCommands = [
            ...(this.isFeatureDevEnabled
                ? [
                      {
                          groupName: 'Application Development',
                          commands: [
                              {
                                  command: '/dev',
                                  placeholder: 'Briefly describe a task or issue',
                                  description:
                                      'Use all project files as context for code suggestions (increases latency).',
                              },
                          ],
                      },
                  ]
                : []),
            ...(this.isGumbyEnabled
                ? [
                      {
                          commands: [
                              {
                                  command: '/transform',
                                  description: 'Transform your Java 8 or 11 Maven project to Java 17',
                              },
                          ],
                      },
                  ]
                : []),
            {
                commands: [
                    {
                        command: '/help',
                        description: 'Learn more about Amazon Q',
                    },
                    {
                        command: '/clear',
                        description: 'Clear this session',
                    },
                ],
            },
        ]

        const commandUnavailability: Record<
            TabType,
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
                unavailableItems: ['/dev', '/transform', '/help', '/clear'],
            },
            gumby: {
                description: "This command isn't available in /transform",
                unavailableItems: ['/dev', '/transform'],
            },
            unknown: {
                description: "This command isn't available",
                unavailableItems: ['/dev', '/transform', '/help', '/clear'],
            },
        }

        return quickActionCommands.map(commandGroup => {
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
