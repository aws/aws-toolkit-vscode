/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatPrompt, MynahUI, QuickActionCommandGroup } from '@aws/mynah-ui'
import { isTabType } from './storages/tabsStorage'
import { WebviewUIHandler } from './main'
import { FeatureContext } from '../../../shared/featureConfig'
import { TabDataGenerator } from './tabs/generator'
import { RegionProfile } from '../../../codewhisperer/models/model'
import { ChatClientAdapter, ChatEventHandler } from '@aws/chat-client'

export class HybridChatAdapter implements ChatClientAdapter {
    private uiHandler?: WebviewUIHandler

    private mynahUIRef?: { mynahUI: MynahUI }

    constructor(
        private enableAgents: boolean,
        private featureConfigsSerialized: [string, FeatureContext][],
        private welcomeCount: number,
        private disclaimerAcknowledged: boolean,
        private regionProfile: RegionProfile | undefined,
        private disabledCommands: string[],
        private isSMUS: boolean,
        private isSM: boolean,
        private ideApiPostMessage: (message: any) => void
    ) {}

    /**
     * First we create the ui handler to get the props, then once mynah UI gets created flare will re-inject the
     * mynah UI instance on the hybrid chat adapter
     */
    createChatEventHandler(mynahUIRef: { mynahUI: MynahUI }): ChatEventHandler {
        this.mynahUIRef = mynahUIRef

        this.uiHandler = new WebviewUIHandler({
            postMessage: this.ideApiPostMessage,
            mynahUIRef: this.mynahUIRef,
            enableAgents: this.enableAgents,
            featureConfigsSerialized: this.featureConfigsSerialized,
            welcomeCount: this.welcomeCount,
            disclaimerAcknowledged: this.disclaimerAcknowledged,
            regionProfile: this.regionProfile,
            disabledCommands: this.disabledCommands,
            isSMUS: this.isSMUS,
            isSM: this.isSM,
            hybridChat: true,
        })

        return this.uiHandler.mynahUIProps
    }

    isSupportedTab(tabId: string): boolean {
        const tabType = this.uiHandler?.tabsStorage.getTab(tabId)?.type
        if (!tabType) {
            return false
        }
        return isTabType(tabType) && tabType !== 'cwc'
    }

    async handleMessageReceive(message: MessageEvent): Promise<void> {
        if (this.uiHandler) {
            return this.uiHandler?.connector?.handleMessageReceive(message)
        }

        // eslint-disable-next-line aws-toolkits/no-console-log
        console.error('unknown message: ', message.data)
    }

    isSupportedQuickAction(command: string): boolean {
        return command === '/review' || command === '/transform'
    }

    handleQuickAction(prompt: ChatPrompt, tabId: string, eventId: string | undefined): void {
        return this.uiHandler?.quickActionHandler?.handle(prompt, tabId, eventId)
    }

    get initialQuickActions(): QuickActionCommandGroup[] {
        const tabDataGenerator = new TabDataGenerator({
            isGumbyEnabled: this.enableAgents,
            isScanEnabled: this.enableAgents,
            disabledCommands: this.disabledCommands,
            commandHighlight: this.featureConfigsSerialized.find(([name]) => name === 'highlightCommand')?.[1],
        })
        return tabDataGenerator.quickActionsGenerator.generateForTab('cwc') ?? []
    }
}
