/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { MessagePublisher, UiMessagePublisher } from '../messages/messagePublisher'
import { MessageListener } from '../messages/messageListener'
import { TabType } from '../webview/ui/storages/tabsStorage'

export interface AmazonQAppInitContext {
    registerWebViewToAppMessagePublisher(eventEmitter: MessagePublisher<any>, tabType: TabType): void
    getAppsToWebViewMessagePublisher(): UiMessagePublisher<any>
    onDidChangeAmazonQVisibility: EventEmitter<boolean>
}

export class DefaultAmazonQAppInitContext implements AmazonQAppInitContext {
    private readonly appsToWebViewEventEmitter = new EventEmitter<any>()
    private readonly appsToWebViewMessageListener = new MessageListener<any>(this.appsToWebViewEventEmitter)
    private readonly appsToWebViewMessagePublisher = new UiMessagePublisher<any>(this.appsToWebViewEventEmitter)
    private readonly webViewToAppsMessagePublishers: Map<TabType, MessagePublisher<any>> = new Map()
    public readonly onDidChangeAmazonQVisibility = new EventEmitter<boolean>()

    static #instance: DefaultAmazonQAppInitContext

    public static get instance() {
        return (this.#instance ??= new this())
    }

    constructor() {}

    registerWebViewToAppMessagePublisher(messagePublisher: MessagePublisher<any>, tabType: TabType): void {
        this.webViewToAppsMessagePublishers.set(tabType, messagePublisher)
    }

    getWebViewToAppsMessagePublishers(): Map<TabType, MessagePublisher<any>> {
        return this.webViewToAppsMessagePublishers
    }

    getAppsToWebViewMessageListener(): MessageListener<any> {
        return this.appsToWebViewMessageListener
    }

    getAppsToWebViewMessagePublisher(): UiMessagePublisher<any> {
        return this.appsToWebViewMessagePublisher
    }
}
