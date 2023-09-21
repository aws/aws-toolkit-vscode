/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { MynahUI } from '@aws/mynah-ui-chat'

export {}
declare global {
    interface Window {
        ideApi: any
        weaverbirdUI: MynahUI
    }
    const acquireVsCodeApi: any
}
