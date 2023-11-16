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
    private isFeatureDevEnabled: boolean
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
                                  groupName: 'Project-level Application Development by Q',
                                  commands: [
                                      {
                                          command: '/dev',
                                          placeholder: 'Describe a new feature or improvement',
                                          description: 'Describe a new feature or improvement',
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
                    ...(this.isGumbyEnabled
                        ? [
                              {
                                  commands: [
                                      {
                                          command: '/transform',
                                          description: 'Transform your code',
                                      },
                                  ],
                              },
                          ]
                        : []),
                ]
        }
    }
}
