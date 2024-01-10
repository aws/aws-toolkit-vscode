/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MynahUI, MynahUIProps, MynahUIDataModel } from '@aws/mynah-ui'
import { waitUntil } from '../../../shared/utilities/timeoutUtils'

export interface MessengerOptions {
    waitIntervalInMs?: number
    waitTimeoutInMs?: number
}

/**
 * Abstraction over tabIds to make it easier to send messages to specific tabs
 */
export class Messenger {
    private defaultWaitIntervalInMs = 5000
    private defaultWaitTimeoutInMs = 600000

    private waitIntervalInMs: number
    private waitTimeoutInMs: number

    constructor(
        private readonly tabID: string,
        private readonly mynahUIProps: MynahUIProps,
        private readonly mynahUI: MynahUI,
        options?: MessengerOptions
    ) {
        this.waitIntervalInMs = options?.waitIntervalInMs ?? this.defaultWaitIntervalInMs
        this.waitTimeoutInMs = options?.waitTimeoutInMs ?? this.defaultWaitTimeoutInMs
    }

    addChatMessage({ prompt, command }: { prompt?: string; command?: string }) {
        if (!this.mynahUIProps.onChatPrompt) {
            assert.fail('onChatPrompt must be defined to use it in the tests')
        }

        this.mynahUIProps.onChatPrompt(this.tabID, {
            prompt,
            escapedPrompt: prompt,
            command,
        })
    }

    clickButton(type: string) {
        if (!this.mynahUIProps.onFollowUpClicked) {
            assert.fail('onFollowUpClicked must be defined to use it in the tests')
        }

        const lastChatItem = this.getChatItems().pop()
        const option = lastChatItem?.followUp?.options?.filter(option => option.type === type)
        if (!option || option.length > 1) {
            assert.fail('Could not find follow up option')
        }

        this.mynahUIProps.onFollowUpClicked(this.tabID, lastChatItem?.messageId ?? '', option[0])
    }

    findCommand(command: string) {
        return this.getCommands()
            .map(groups => groups.commands)
            .flat()
            .filter(commands => commands.command === command)
    }

    getCommands() {
        return this.getStore().quickActionCommands ?? []
    }

    getChatItems() {
        return this.getStore().chatItems ?? []
    }

    async waitForChatFinishesLoading() {
        const isFinishedLoading = (): boolean => {
            return this.getStore().loadingChat === false
        }

        /**
         * Wait until the chat has finished loading. This happens when a backend request
         * has finished and responded in the chat
         */
        await waitUntil(
            () => {
                return Promise.resolve(isFinishedLoading())
            },
            {
                interval: this.waitIntervalInMs,
                timeout: this.waitTimeoutInMs,
                truthy: true,
            }
        )

        // Do another check just in case the waitUntil time'd out
        if (!isFinishedLoading()) {
            assert.fail(`Chat has not finished loading in: ${this.waitTimeoutInMs} ms`)
        }
    }

    private getStore(): MynahUIDataModel {
        const store = this.mynahUI.getAllTabs()[this.tabID].store
        if (!store) {
            assert.fail(`${this.tabID} does not have a store`)
        }
        return store
    }
}
