/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSDOM } from 'jsdom'
/**
 * JSDOM is used to help hoist MynahUI to running in a node environment vs in the browser (which is what it's made for)
 */
const dom = new JSDOM(undefined, {
    pretendToBeVisual: true,
    includeNodeLocations: true,
})
global.window = dom.window as unknown as Window & typeof globalThis
global.document = dom.window.document
global.self = dom.window as unknown as Window & typeof globalThis
global.Element = dom.window.Element
global.HTMLElement = dom.window.HTMLElement

// jsdom doesn't have support for innerText: https://github.com/jsdom/jsdom/issues/1245 which mynah ui uses
Object.defineProperty(global.Element.prototype, 'innerText', {
    get() {
        return this.textContent
    },
})

// jsdom doesn't have support for structuredClone. See https://github.com/jsdom/jsdom/issues/3363
global.structuredClone = val => JSON.parse(JSON.stringify(val))

import * as vscode from 'vscode'
import { createMynahUI } from '../../../amazonq/webview/ui/main'
import { MynahUI, MynahUIProps } from '@aws/mynah-ui'
import { DefaultAmazonQAppInitContext } from '../../../amazonq/apps/initContext'
import { TabType } from '../../../amazonq/webview/ui/storages/tabsStorage'
import { Messenger, MessengerOptions } from './messenger'

/**
 * Abstraction over Amazon Q to make e2e testing easier
 */
export class qTestingFramework {
    private readonly mynahUI: MynahUI
    private readonly mynahUIProps: MynahUIProps
    private disposables: vscode.Disposable[] = []

    constructor(featureName: TabType, featureDevEnabled: boolean, gumbyEnabled: boolean) {
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
            featureDevEnabled,
            gumbyEnabled
        )
        this.mynahUI = ui.mynahUI
        this.mynahUIProps = (this.mynahUI as any).props

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

    public dispose() {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
