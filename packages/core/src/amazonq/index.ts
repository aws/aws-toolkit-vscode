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
export { LspController } from './lsp/lspController'
export { LspClient } from './lsp/lspClient'
export { api } from './extApi'
export { AmazonQChatViewProvider } from './webview/webView'
export { init as cwChatAppInit } from '../codewhispererChat/app'
export { init as featureDevChatAppInit } from '../amazonqFeatureDev/app'
export { init as gumbyChatAppInit } from '../amazonqGumby/app'
export { init as testChatAppInit } from '../amazonqTest/app'
export { init as docChatAppInit } from '../amazonqDoc/app'
export { amazonQHelpUrl } from '../shared/constants'
export * as webviewConstants from './webview/ui/texts/constants'
export * as webviewTabConstants from './webview/ui/tabs/constants'
export { listCodeWhispererCommandsWalkthrough } from '../codewhisperer/ui/statusBarMenu'
export { focusAmazonQPanel, focusAmazonQPanelKeybinding } from '../codewhispererChat/commands/registerCommands'
export { TryChatCodeLensProvider, tryChatCodeLensCommand } from '../codewhispererChat/editor/codelens'
export {
    createAmazonQUri,
    openDiff,
    openDeletedDiff,
    getOriginalFileUri,
    getFileDiffUris,
    computeDiff,
} from './commons/diff'
export { AuthFollowUpType, AuthMessageDataMap } from './auth/model'
export { ChatItemType } from './commons/model'
export { ExtensionMessage } from '../amazonq/webview/ui/commands'
export { CodeReference } from '../codewhispererChat/view/connector/connector'
export { extractAuthFollowUp } from './util/authUtils'
export { Messenger } from './commons/connector/baseMessenger'
export * from './lsp/config'
export * as WorkspaceLspInstaller from './lsp/workspaceInstaller'
export * as secondaryAuth from '../auth/secondaryAuth'
export * as authConnection from '../auth/connection'
import { FeatureContext } from '../shared/featureConfig'

/**
 * main from createMynahUI is a purely browser dependency. Due to this
 * we need to create a wrapper function that will dynamically execute it
 * while only running on browser instances (like the e2e tests). If we
 * just export it regularly we will get "ReferenceError: self is not defined"
 */
export function createMynahUI(
    ideApi: any,
    amazonQEnabled: boolean,
    featureConfigsSerialized: [string, FeatureContext][],
    welcomeCount: number,
    disabledCommands?: string[]
) {
    if (typeof window !== 'undefined') {
        const mynahUI = require('./webview/ui/main')
        return mynahUI.createMynahUI(ideApi, amazonQEnabled, featureConfigsSerialized, welcomeCount, disabledCommands)
    }
    throw new Error('Not implemented for node')
}

export * from './commons/types'
