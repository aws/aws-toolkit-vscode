/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export { activate } from './activation'
export { DefaultAmazonQAppInitContext } from './apps/initContext'
export { TabType } from './webview/ui/storages/tabsStorage'

/**
 * main from createMynahUI is a purely browser dependency. Due to this
 * we need to create a wrapper function that will dynamically execute it
 * while only running on browser instances (like the e2e tests). If we
 * just export it regularly we will get "ReferenceError: self is not defined"
 */
export function createMynahUI(ideApi: any, amazonQEnabled: boolean) {
    if (typeof window !== 'undefined') {
        const mynahUI = require('./webview/ui/main')
        return mynahUI.createMynahUI(ideApi, amazonQEnabled)
    }
    throw new Error('Not implemented for node')
}
