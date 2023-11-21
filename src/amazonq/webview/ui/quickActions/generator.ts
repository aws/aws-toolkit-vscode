/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickActionCommandGroup } from '@aws/mynah-ui-chat/dist/static'
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
        switch (tabType) {
            case 'featuredev':
                return []
            default:
                return [
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
        }
    }
}
