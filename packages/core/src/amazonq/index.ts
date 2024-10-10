/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export { AmazonQAppInitContext, DefaultAmazonQAppInitContext } from './apps/initContext'
export { TabType } from './webview/ui/storages/tabsStorage'
export { MessagePublisher } from './messages/messagePublisher'
export { MessageListener } from './messages/messageListener'
export { AuthController } from './auth/controller'
export { showAmazonQWalkthroughOnce } from './onboardingPage/walkthrough'
export {
    focusAmazonQChatWalkthrough,
    openAmazonQWalkthrough,
    walkthroughInlineSuggestionsExample,
    walkthroughSecurityScanExample,
} from './onboardingPage/walkthrough'
export { LspController, Content } from './lsp/lspController'
export { LspClient } from './lsp/lspClient'
export { api } from './extApi'
export { AmazonQChatViewProvider } from './webview/webView'
export { init as cwChatAppInit } from '../codewhispererChat/app'
export { init as featureDevChatAppInit } from '../amazonqFeatureDev/app'
export { init as gumbyChatAppInit } from '../amazonqGumby/app'
export { activateBadge } from './util/viewBadgeHandler'
export { amazonQHelpUrl } from '../shared/constants'
export { listCodeWhispererCommandsWalkthrough } from '../codewhisperer/ui/statusBarMenu'
export { focusAmazonQPanel, focusAmazonQPanelKeybinding } from '../codewhispererChat/commands/registerCommands'
export { TryChatCodeLensProvider, tryChatCodeLensCommand } from '../codewhispererChat/editor/codelens'
export { createAmazonQUri, openDiff, openDeletedDiff, getOriginalFileUri, getFileDiffUris } from './commons/diff'
import { FeatureContext } from '../shared'

/**
 * main from createMynahUI is a purely browser dependency. Due to this
 * we need to create a wrapper function that will dynamically execute it
 * while only running on browser instances (like the e2e tests). If we
 * just export it regularly we will get "ReferenceError: self is not defined"
 */
export function createMynahUI(
    ideApi: any,
    amazonQEnabled: boolean,
    featureConfigsSerialized: [string, FeatureContext][]
) {
    if (typeof window !== 'undefined') {
        const mynahUI = require('./webview/ui/main')
        return mynahUI.createMynahUI(ideApi, amazonQEnabled, featureConfigsSerialized)
    }
    throw new Error('Not implemented for node')
}
