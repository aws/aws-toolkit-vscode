/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { VueWebview } from '../../webviews/main'

class DevPortalWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/amazonqFeatureDev/webview/vue/index.js'
    public readonly id = 'amazonqFeatureDev'

    constructor() {
        super(DevPortalWebview.sourcePath)
    }
}

const DevPortalWebviewPanel = VueWebview.compilePanel(DevPortalWebview)

export { DevPortalWebviewPanel }
