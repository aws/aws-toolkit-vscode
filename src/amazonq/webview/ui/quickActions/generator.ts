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
                                          command: '/tests',
                                          placeholder: 'Let Q write tests for your project',
                                          description: 'Let Q write tests for your project',
                                      },
                                      {
                                          command: '/dev',
                                          placeholder: 'Describe a new feature or improvement',
                                          description: 'Describe a new feature or improvement',
                                      },
                                      {
                                          command: '/fix',
                                          placeholder: 'Fix an issue across your project',
                                          description: 'Fix an issue across your project',
                                      },
                                  ],
                              },
                          ]
                        : []),
                    {
                        commands: [
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
