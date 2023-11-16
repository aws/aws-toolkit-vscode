/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickActionCommandGroup } from '@aws/mynah-ui-chat/dist/static'
import { TabType } from '../storages/tabsStorage'

export interface QuickActionGeneratorProps {
    isWeaverbirdEnabled: boolean
    isGumbyEnabled: boolean
}

export class QuickActionGenerator {
    private isWeaverbirdEnabled: boolean
    private isGumbyEnabled: boolean

    constructor(props: QuickActionGeneratorProps) {
        this.isWeaverbirdEnabled = props.isWeaverbirdEnabled
        this.isGumbyEnabled = props.isGumbyEnabled
    }

    public generateForTab(tabType: TabType): QuickActionCommandGroup[] {
        switch (tabType) {
            case 'wb':
                return []
            default:
                return [
                    ...(this.isWeaverbirdEnabled
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
                                command: '/clear',
                                description: 'Clear this session',
                            },
                        ],
                    },
                ]
        }
    }
}
