/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import vscode from 'vscode'
import { Commands, RegisteredCommand, VsCodeCommandArg, placeholder } from '../shared/vscode/commands2'
import { ServiceItemId, isServiceItemId } from '../auth/ui/vue/types'
import { authCommands } from '../auth/utils'
import { showCodeWhispererConnectionPrompt } from '../codewhisperer/util/showSsoPrompt'
import { AuthSource, AuthSources } from './webview/util'
import { isCloud9 } from '../shared/extensionUtilities'
import { isWeb } from '../shared/extensionGlobals'
import { CommonAuthWebview } from './webview/vue/backend'

let showManageConnections: RegisteredCommand<any> | undefined
export function getShowManageConnections(): RegisteredCommand<any> {
    if (!showManageConnections) {
        throw new Error('showManageConnections not registered')
    }
    return showManageConnections
}

export function registerCommands(context: vscode.ExtensionContext, prefix: string) {
    showManageConnections = Commands.register(
        { id: `aws.${prefix}.auth.manageConnections`, compositeKey: { 1: 'source' } },
        async (_: VsCodeCommandArg, source: AuthSource, serviceToShow?: ServiceItemId) => {
            if (_ !== placeholder) {
                source = AuthSources.vscodeComponent
            }

            // The auth webview page does not make sense to use in C9,
            // so show the auth quick pick instead.
            if (isCloud9('any') || isWeb()) {
                if (source.toLowerCase().includes('codewhisperer')) {
                    // Show CW specific quick pick for CW connections
                    return showCodeWhispererConnectionPrompt()
                }
                return authCommands().addConnection.execute()
            }

            if (!isServiceItemId(serviceToShow)) {
                serviceToShow = undefined
            }

            // TODO: hack
            if (prefix === 'toolkit') {
                CommonAuthWebview.authSource = source
                await vscode.commands.executeCommand('aws.explorer.setLoginService', serviceToShow)
                await vscode.commands.executeCommand('setContext', 'aws.explorer.showAuthView', true)
                await vscode.commands.executeCommand('aws.toolkit.AmazonCommonAuth.focus')
            }
        }
    )
}
