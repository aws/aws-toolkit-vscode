/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'
import { Region } from '../../../shared/regions/endpoints'
export class CommonAuthWebview extends VueWebview {
    public override id: string = 'aws.AmazonQChatView2'
    public override source: string = 'src/ac/webview/vue/index.js'

    public getRegions(): Region[] {
        return globals.regionProvider.getRegions().reverse()
    }
}
