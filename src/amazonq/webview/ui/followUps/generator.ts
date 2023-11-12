/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TabType } from "../storages/tabsStorage"
import { FollowUpsBlock } from "./model"

export interface FollowUpGeneratorProps {
    isWeaverbirdEnabled: boolean
}


export class FollowUpGenerator {
    private isWeaverbirdEnabled: boolean

    constructor (props: FollowUpGeneratorProps) {
        this.isWeaverbirdEnabled = props.isWeaverbirdEnabled
    }

    public generateWelcomeBlockForTab (tabType: TabType): FollowUpsBlock {
        switch (tabType) {
            case 'wb':
                return {
                    text: 'Would you like to follow up with',
                    options: [
                        {
                            pillText: 'Modify source folder',
                            type: 'ModifyDefaultSourceFolder',
                        },
                    ],
                }
            default: 
            return {
                text: 'Or you can select one of these',
                options: [
                    ...(this.isWeaverbirdEnabled
                        ? [
                            {
                                pillText: 'I want to assign a code task',
                                type: 'assign-code-task',
                            },
                        ]
                        : []),
                    {
                        pillText: 'I have a software development question',
                        type: 'continue-to-chat',
                    },
                ],
            }
        }
    }

}