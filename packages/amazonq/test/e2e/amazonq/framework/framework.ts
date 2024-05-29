/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { injectJSDOM } from './jsdomInjector'

// This needs to be ran before all other imports so that mynah ui gets loaded inside of jsdom
injectJSDOM()

import * as vscode from 'vscode'
import { MynahUI, MynahUIProps } from '@aws/mynah-ui'
import { DefaultAmazonQAppInitContext, TabType, createMynahUI } from 'aws-core-vscode/amazonq'
import { Messenger, MessengerOptions } from './messenger'

/**
 * Abstraction over Amazon Q to make e2e testing easier
 */
export class qTestingFramework {
    private readonly mynahUI: MynahUI
    private readonly mynahUIProps: MynahUIProps
    private disposables: vscode.Disposable[] = []

    lastEventId: string = ''

    constructor(featureName: TabType, amazonQEnabled: boolean) {
        /**
         * Instantiate the UI and override the postMessage to publish using the app message
         * publishers directly.
         *
         * The postMessage function implements the MynahUI -> VSCode flow
         */
        const ui = createMynahUI(
            {
                postMessage: (message: string) => {
                    const appMessagePublisher = DefaultAmazonQAppInitContext.instance
                        .getWebViewToAppsMessagePublishers()
                        .get(featureName)
                    if (appMessagePublisher === undefined) {
                        return
                    }
                    appMessagePublisher.publish(message)
                },
            },
            amazonQEnabled
        )
        this.mynahUI = ui.mynahUI
        this.mynahUIProps = (this.mynahUI as any).props

        /**
         * In order to successfully remove tabs we need the last event id
         */
        const originalOnTabAdd = this.mynahUIProps.onTabAdd
        this.mynahUIProps.onTabAdd = (tabId, eventId) => {
            this.lastEventId = eventId ?? this.lastEventId
            originalOnTabAdd && originalOnTabAdd(tabId)
        }

        /**
         * Listen to incoming events coming from VSCode and redirect them to MynahUI
         *
         * This implements the VSCode -> Mynah UI flow
         */
        this.disposables.push(
            DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessageListener().onMessage(async message => {
                // Emulate the json format of postMessage
                const event = {
                    data: JSON.stringify(message),
                } as any
                await ui.messageReceiver(event)
            })
        )
    }

    /**
     * Create a new tab and then return a new encapsulated tab messenger that makes it easier to directly call
     * functionality against a specific tab
     */
    public createTab(options?: MessengerOptions) {
        const newTabID = this.mynahUI.updateStore('', {})
        if (!newTabID) {
            throw new Error('Could not create tab id')
        }
        return new Messenger(newTabID, this.mynahUIProps, this.mynahUI, options)
    }

    public removeTab(tabId: string) {
        this.mynahUI.removeTab(tabId, this.lastEventId)
    }

    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
