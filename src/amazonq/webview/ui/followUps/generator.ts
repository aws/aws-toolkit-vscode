/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahIcons } from '@aws/mynah-ui-chat'
import { TabType } from '../storages/tabsStorage'
import { FollowUpsBlock } from './model'

export type AuthFollowUpType = 'full-auth' | 're-auth'

export class FollowUpGenerator {
    public generateAuthFollowUps(tabType: TabType, authType: AuthFollowUpType): FollowUpsBlock {
        switch (tabType) {
            default:
                return {
                    text: '',
                    options: [
                        {
                            pillText: authType === 'full-auth' ? 'Authenticate' : 'Re-Authenticate',
                            type: authType,
                            status: 'info',
                            icon: 'refresh' as MynahIcons,
                        },
                    ],
                }
        }
    }

    public generateWelcomeBlockForTab(tabType: TabType): FollowUpsBlock {
        switch (tabType) {
            case 'featuredev':
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
                        {
                            pillText: 'I have a software development question',
                            type: 'continue-to-chat',
                        },
                    ],
                }
        }
    }
}
