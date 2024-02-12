/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'

export class CommonAuthWebview extends VueWebview {
    public override id: string = 'aws.AmazonQChatView2'
    public override source: string = 'src/ac/webview/vue/index.js'

    public getRegions(): string[] {
        console.log(globals.regionProvider.getRegions().map(i => i.name))
        return globals.regionProvider.getRegions().map(i => i.name)
    }
}

const panel = VueWebview.compilePanel(CommonAuthWebview)
let activePanel: InstanceType<typeof Panel> | undefined
