/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'vscode'
import { DefaultAmazonQAppInitContext } from '../../../amazonq/apps/initContext'
import { MessagePublisher } from '../../../amazonq/messages/messagePublisher'
import assert from 'assert'

describe('DefaultAmazonQAppInitContext', () => {
    let context: DefaultAmazonQAppInitContext

    beforeEach(() => {
        context = new DefaultAmazonQAppInitContext()
    })

    describe('registerWebViewToAppMessagePublisher', () => {
        it('should add the publisher to the map', () => {
            const publisher = new MessagePublisher(new EventEmitter())
            context.registerWebViewToAppMessagePublisher(publisher, 'unknown')
            assert.strictEqual(context.getWebViewToAppsMessagePublishers().get('unknown'), publisher)
        })
    })

    describe('getAppsToWebViewMessagePublisher', () => {
        it('should return the publisher', () => {
            assert.notDeepStrictEqual(context.getAppsToWebViewMessagePublisher(), undefined)
        })
    })

    describe('getAppsToWebViewMessageListener', () => {
        it('should return the listener', () => {
            assert.notDeepStrictEqual(context.getAppsToWebViewMessageListener(), undefined)
        })
    })

    describe('onDidChangeAmazonQVisibility', () => {
        it('should be an EventEmitter', () => {
            assert.strictEqual(context.onDidChangeAmazonQVisibility instanceof EventEmitter, true)
        })
    })
})
