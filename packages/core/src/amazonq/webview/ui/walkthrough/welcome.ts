/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemType, MynahIcons, MynahUITabStoreTab } from '@aws/mynah-ui'
import { TabDataGenerator } from '../tabs/generator'

export const welcomeScreenTabData = (tabs: TabDataGenerator): MynahUITabStoreTab => ({
    isSelected: true,
    store: {
        quickActionCommands: tabs.quickActionsGenerator.generateForTab('welcome'),
        contextCommands: tabs.getTabData('cwc', false).contextCommands,
        tabTitle: 'Welcome to Q',
        tabBackground: true,
        chatItems: [
            {
                type: ChatItemType.ANSWER,
                icon: MynahIcons.ASTERISK,
                messageId: 'new-welcome-card',
                body: `#### Work on a task using agentic capabilities
_Generate code, scan for issues, and more._`,
                buttons: [
                    {
                        id: 'explore',
                        disabled: false,
                        text: 'Explore',
                    },
                    {
                        id: 'quick-start',
                        text: 'Quick start',
                        disabled: false,
                        status: 'main',
                    },
                ],
            },
        ],
        promptInputLabel: 'Or, start a chat',
        promptInputPlaceholder: 'Type your question',
        compactMode: true,
        tabHeaderDetails: {
            title: "Hi, I'm Amazon Q.",
            description: 'Where would you like to start?',
            icon: MynahIcons.Q,
        },
    },
})
