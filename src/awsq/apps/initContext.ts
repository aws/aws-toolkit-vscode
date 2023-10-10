/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { MessagePublisher } from '../messages/messagePublisher'
import { MessageListener } from '../messages/messageListener'

export interface AwsQAppInitContext {
    registerWebViewToAppMessagePublisher(eventEmitter: MessagePublisher<any>): void
    getAppsToWebViewMessagePublisher(): MessagePublisher<any>
}

export class DefaultAwsQAppInitContext implements AwsQAppInitContext {
    private readonly appsToWebViewEventEmitter = new EventEmitter<any>()
    private readonly appsToWebViewMessageListener = new MessageListener<any>(this.appsToWebViewEventEmitter)
    private readonly appsToWebViewMessagePublisher = new MessagePublisher<any>(this.appsToWebViewEventEmitter)
    private readonly webViewToAppsMessagePublishers: MessagePublisher<any>[] = []

    constructor() {}

    registerWebViewToAppMessagePublisher(messagePublisher: MessagePublisher<any>): void {
        this.webViewToAppsMessagePublishers.push(messagePublisher)
    }

    getWebViewToAppsMessagePublishers(): MessagePublisher<any>[] {
        return this.webViewToAppsMessagePublishers
    }

    getAppsToWebViewMessageListener(): MessageListener<any> {
        return this.appsToWebViewMessageListener
    }

    getAppsToWebViewMessagePublisher(): MessagePublisher<any> {
        return this.appsToWebViewMessagePublisher
    }
}
