/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module sets up the necessary components
 * for the webview to be shown.
 */

import { getIdeProperties, isCloud9 } from '../../../shared/extensionUtilities'
import { VueWebview } from '../../../webviews/main'
import * as vscode from 'vscode'
import {
    CredentialsData,
    CredentialsKey,
    SectionName,
    StaticProfile,
    StaticProfileKeyErrorMessage,
} from '../../credentials/types'
import { Auth, signout, tryAddCredentials } from '../../auth'
import { getCredentialFormatError, getCredentialsErrors } from '../../credentials/validation'
import { profileExists } from '../../credentials/sharedCredentials'
import { getLogger } from '../../../shared/logger'
import { AuthUtil as CodeWhispererAuth } from '../../../codewhisperer/util/authUtil'
import { awsIdSignIn } from '../../../codewhisperer/util/showSsoPrompt'
import { CodeCatalystAuthenticationProvider } from '../../../codecatalyst/auth'
import { getStartedCommand } from '../../../codecatalyst/explorer'
import { ToolkitError } from '../../../shared/errors'
import { isBuilderIdConnection } from '../../connection'

export class AuthWebview extends VueWebview {
    public override id: string = 'authWebview'
    public override source: string = 'src/auth/ui/vue/index.js'
    public readonly onDidConnectionUpdate = new vscode.EventEmitter<undefined>()

    private codeCatalystAuth: CodeCatalystAuthenticationProvider

    constructor() {
        super()
        const ccAuth = CodeCatalystAuthenticationProvider.instance
        if (ccAuth === undefined) {
            throw new ToolkitError('Code Catalyst auth instance singleton was not created externally yet.')
        }
        this.codeCatalystAuth = ccAuth
    }

    async getProfileNameError(profileName?: SectionName, required = true): Promise<string | undefined> {
        if (!profileName) {
            if (required) {
                return 'Profile name is required'
            }
            return
        }

        if (await profileExists(profileName)) {
            return 'Profile name already exists'
        }
    }

    getCredentialFormatError(key: CredentialsKey, value: string | undefined): string | undefined {
        getLogger().warn('getCredentialFormatError(): %s %s', key, value)
        return getCredentialFormatError(key, value)
    }

    getCredentialsSubmissionErrors(data: CredentialsData): CredentialsData | undefined {
        return getCredentialsErrors(data)
    }

    async trySubmitCredentials(profileName: SectionName, data: StaticProfile) {
        return tryAddCredentials(profileName, data, true)
    }

    isCredentialConnected(): boolean {
        const conn = Auth.instance.activeConnection

        if (!conn) {
            return false
        }
        // Maybe need to use SecondaryAuth registerAuthListener()
        /**
         *
         * When a Builder ID is active and cred is not, the BID is
         * the main active connection. BID's are saveable and checked
         * by registerAuthListenter().
         *
         * What this means is that when creds are activated they become
         * the main Auth.instance.activeConnection and BID is a secondary
         * one.
         *
         * TODO: Show the quickpick and tell them to pick a credentials
         * connection to use.
         *
         */
        return conn.type === 'iam' && conn.state === 'valid'
    }

    async getAuthenticatedCredentialsError(data: StaticProfile): Promise<StaticProfileKeyErrorMessage | undefined> {
        return Auth.instance.authenticateData(data)
    }

    async startCodeWhispererBuilderIdSetup(): Promise<void> {
        try {
            await awsIdSignIn()
        } catch (e) {
            return
        }
    }

    async startCodeCatalystBuilderIdSetup(): Promise<void> {
        return getStartedCommand.execute(this.codeCatalystAuth)
    }

    isCodeWhispererBuilderIdConnected(): boolean {
        return CodeWhispererAuth.instance.isBuilderIdInUse() && CodeWhispererAuth.instance.isConnectionValid()
    }

    isCodeCatalystBuilderIdConnected(): boolean {
        return this.codeCatalystAuth.isConnectionValid()
    }

    async signoutBuilderId(): Promise<void> {
        await this.deleteSavedBuilderIdConns()

        // Deletes active connection
        const builderIdConn = (await Auth.instance.listConnections()).find(isBuilderIdConnection)
        await signout(Auth.instance, builderIdConn)
    }

    private async deleteSavedBuilderIdConns(): Promise<void> {
        if (CodeWhispererAuth.instance.isBuilderIdInUse()) {
            await CodeWhispererAuth.instance.secondaryAuth.removeConnection()
        }

        if (this.codeCatalystAuth.activeConnection) {
            await this.codeCatalystAuth.removeSavedConnection()
        }
    }

    /**
     * Sets up {@link onDidConnectionUpdate} to emit auth change events
     * that happen outside of the webview (eg: status bar > quickpick).
     */
    setupConnectionChangeEmitter() {
        const events = [
            this.codeCatalystAuth.onDidChangeActiveConnection,
            CodeWhispererAuth.instance.secondaryAuth.onDidChangeActiveConnection,
            Auth.instance.onDidChangeActiveConnection,
            Auth.instance.onDidChangeConnectionState,
        ]

        events.forEach(event =>
            event(() => {
                this.onDidConnectionUpdate.fire(undefined)
            })
        )
    }
}

const Panel = VueWebview.compilePanel(AuthWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export async function showAuthWebview(ctx: vscode.ExtensionContext): Promise<void> {
    activePanel ??= new Panel(ctx)

    activePanel.server.setupConnectionChangeEmitter()

    const webview = await activePanel!.show({
        title: `Add Connection to ${getIdeProperties().company}`,
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}
