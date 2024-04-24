/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {QuickActionCommand, QuickActionCommandGroup} from '@aws/mynah-ui-chat/dist/static'
import { TabType } from '../storages/tabsStorage'

export interface QuickActionGeneratorProps {
    isFeatureDevEnabled: boolean
    isCodeTransformEnabled: boolean
}

export class QuickActionGenerator {
    public isFeatureDevEnabled: boolean
    public isCodeTransformEnabled: boolean

    constructor(props: QuickActionGeneratorProps) {
        this.isFeatureDevEnabled = props.isFeatureDevEnabled
        this.isCodeTransformEnabled = props.isCodeTransformEnabled
    }

    public generateForTab(tabType: TabType): QuickActionCommandGroup[] {
        const quickActionCommands = [
            {
                commands: [
                    ...(this.isFeatureDevEnabled
                        ? [
                            {
                                command: '/dev',
                                placeholder: 'Briefly describe a task or issue',
                                description:
                                    'Plan and implement new functionality across multiple files in your workspace.',
                            },
                        ]
                        : []),
                    ...(this.isCodeTransformEnabled
                        ? [
                            {
                                command: '/transform',
                                description: 'Transform your Java 8 or 11 Maven project to Java 17',
                            },
                        ]
                        : []),
                ],
            },
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
            codetransform: {
                description: "This command isn't available in /transform",
                unavailableItems: ['/dev', '/transform'],
            },
            unknown: {
                description: '',
                unavailableItems: [],
            },
        }

        return quickActionCommands.map((commandGroup: QuickActionCommandGroup) => {
            return {
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
