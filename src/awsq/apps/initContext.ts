/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { MessagePublisher } from '../messages/messagePublisher'
import { MessageListener } from '../messages/messageListener'
import { TabType } from '../webview/ui/storages/tabTypeStorage'

export interface AwsQAppInitContext {
    registerWebViewToAppMessagePublisher(eventEmitter: MessagePublisher<any>, tabType: TabType): void
    getAppsToWebViewMessagePublisher(): MessagePublisher<any>
}

export class DefaultAwsQAppInitContext implements AwsQAppInitContext {
    private readonly appsToWebViewEventEmitter = new EventEmitter<any>()
    private readonly appsToWebViewMessageListener = new MessageListener<any>(this.appsToWebViewEventEmitter)
    private readonly appsToWebViewMessagePublisher = new MessagePublisher<any>(this.appsToWebViewEventEmitter)
    private readonly webViewToAppsMessagePublishers: Map<TabType, MessagePublisher<any>> = new Map()

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

    getAppsToWebViewMessagePublisher(): MessagePublisher<any> {
        return this.appsToWebViewMessagePublisher
    }
}
