/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */


import {QuickActionCommandGroup } from "@aws/mynah-ui-chat/dist/static"
import { TabType } from "../storages/tabsStorage"

export interface QuickActionGeneratorProps {
    isWeaverbirdEnabled: boolean
}


export class QuickActionGenerator {
    private isWeaverbirdEnabled: boolean

    constructor (props: QuickActionGeneratorProps) {
        this.isWeaverbirdEnabled = props.isWeaverbirdEnabled
    }

    public generateForTab(tabType: TabType): QuickActionCommandGroup[]{
        switch(tabType){
            case 'wb':
                return []
            default: 
            return [
                ...(this.isWeaverbirdEnabled
                    ? [
                          {
                              groupName: 'Start a workflow',
                              commands: [
                                  {
                                      command: '/dev',
                                      placeholder: 'Enter the coding task in details',
                                      description: 'Assign Q a coding task',
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
