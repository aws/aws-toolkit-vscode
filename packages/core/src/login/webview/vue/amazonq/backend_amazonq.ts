/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { scopesCodeWhispererChat, AwsConnection, Connection } from '../../../../auth/connection'
import { AuthUtil, amazonQScopes } from '../../../../codewhisperer/util/authUtil'
import { AuthError, CommonAuthWebview, userCancelled } from '../backend'
import { awsIdSignIn } from '../../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../../codewhisperer/util/getStartUrl'
import { activateExtension, isExtensionInstalled } from '../../../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../../../shared/extensions'
import { getLogger } from '../../../../shared/logger'
import { Auth } from '../../../../auth'
import { ToolkitError } from '../../../../shared/errors'
import { debounce } from 'lodash'
import { AuthFlowState } from '../types'

export class AmazonQLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.amazonq.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/amazonq/index.js'

    override onActiveConnectionModified = new vscode.EventEmitter<void>()

    constructor() {
        super(AmazonQLoginWebview.sourcePath)

        this.setupConnectionEventEmitter()
    }

    async fetchConnections(): Promise<AwsConnection[] | undefined> {
        if (!isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
            return undefined
        }
        await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const importedApi = toolkitExt?.exports.getApi(VSCODE_EXTENSION_ID.amazonq)
        const connections: AwsConnection[] = []
        if (importedApi && 'listConnections' in importedApi) {
            return await importedApi?.listConnections()
        }
        return connections
    }
    /**
     * Gets a connection that is usable by Amazon Q.
     *
     * @param connections List of AWS Toolkit Connections
     * @returns Amazon Q connection, or undefined if none of the given connections have scopes required for Amazon Q.
     */
    findConnection(connections: AwsConnection[]): AwsConnection | undefined {
        const hasQScopes = (c: AwsConnection) => amazonQScopes.every(s => c.scopes?.includes(s))
        const score = (c: AwsConnection) => Number(hasQScopes(c)) * 10 + Number(c.state === 'valid')
        connections.sort(function (a, b) {
            return score(b) - score(a)
        })
        if (hasQScopes(connections[0])) {
            return connections[0]
        }
        return undefined
    }

    async useConnection(connectionId: string): Promise<AuthError | undefined> {
        return this.ssoSetup('useConnection', async () => {
            if (!isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
                return
            }
            try {
                await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
                const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
                const importedApi = toolkitExt?.exports.getApi(VSCODE_EXTENSION_ID.amazonq)
                if (importedApi && 'listConnections' in importedApi) {
                    const connections: AwsConnection[] = await importedApi?.listConnections()
                    for (const conn of connections) {
                        if (conn.id === connectionId) {
                            if (conn.scopes?.includes(scopesCodeWhispererChat[0])) {
                                getLogger().info(`auth: re-use connection from existing connection id ${connectionId}`)
                                const newConn = await Auth.instance.createConnectionFromApi(conn)
                                await AuthUtil.instance.secondaryAuth.useNewConnection(newConn)
                            } else {
                                getLogger().info(
                                    `auth: re-use(new scope) to connection from existing connection id ${connectionId}`
                                )
                                // when re-using a connection from toolkit, if adding scope is necessary
                                // temporarily create a new connection without triggerring any connection hooks
                                // then try reauthenticate, if success, use this connection, toolkit connnection scope also gets updated.
                                // if failed, connection is set to invalid
                                const oldScopes = conn?.scopes ? conn.scopes : []
                                const newScopes = Array.from(new Set([...oldScopes, ...amazonQScopes]))
                                const newConn = await Auth.instance.createConnectionFromApi({
                                    type: conn.type,
                                    ssoRegion: conn.ssoRegion,
                                    scopes: newScopes,
                                    startUrl: conn.startUrl,
                                    state: conn.state,
                                    id: conn.id,
                                    label: conn.label,
                                })
                                await Auth.instance.reauthenticate(newConn)
                                await AuthUtil.instance.secondaryAuth.useNewConnection(newConn)
                            }
                        }
                    }
                }
            } catch (e) {
                throw ToolkitError.chain(e, 'Failed to add Amazon Q scope', {
                    code: 'FailedToConnect',
                })
            }
        })
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererBuilderIdSetup', async () => {
            await awsIdSignIn()
            await vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS Builder ID')
        })
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            await connectToEnterpriseSso(startUrl, region)
            void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS IAM Identity Center')
        })
    }

    async reauthenticateConnection(): Promise<void> {
        this.isReauthenticating = true
        this.reauthError = undefined

        try {
            /**
             * IMPORTANT: During this process {@link this.onActiveConnectionModified} is triggered. This
             * causes the reauth page to refresh before the user is actually done the whole reauth flow.
             */
            this.reauthError = await this.ssoSetup('reauthenticate', async () => AuthUtil.instance.reauthenticate(true))
        } finally {
            this.isReauthenticating = false
        }

        if (this.reauthError?.id === userCancelled) {
            // Since reauth was not successful it did not trigger an update in the connection.
            // We need to pretend it changed so our frontend triggers an update.
            this.onActiveConnectionModified.fire()
        }
    }

    private reauthError: AuthError | undefined = undefined
    override async getReauthError(): Promise<AuthError | undefined> {
        return this.reauthError
    }

    async getActiveConnection(): Promise<Connection | undefined> {
        return AuthUtil.instance.conn
    }

    /**
     * `true` if the actual reauth flow is in progress.
     *
     * We need this state since the reauth process triggers
     * {@link this.onActiveConnectionModified} before it is actually done.
     * This causes the UI to refresh, and we need to remember that we are
     * still in the process of reauthenticating.
     */
    isReauthenticating: boolean = false
    private authState: AuthFlowState = 'LOGIN'
    override async refreshAuthState(): Promise<void> {
        const featureAuthStates = await AuthUtil.instance.getChatAuthState()
        if (featureAuthStates.amazonQ === 'expired') {
            this.authState = this.isReauthenticating ? 'REAUTHENTICATING' : 'REAUTHNEEDED'
            return
        }
        this.authState = 'LOGIN'
    }

    override async getAuthState(): Promise<AuthFlowState> {
        return this.authState
    }

    override async signout(): Promise<void> {
        await AuthUtil.instance.secondaryAuth.deleteConnection()
        this.reauthError = undefined
    }

    async errorNotification(e: AuthError) {
        await vscode.window.showInformationMessage(`${e.text}`)
    }

    override startIamCredentialSetup(
        profileName: string,
        accessKey: string,
        secretKey: string
    ): Promise<AuthError | undefined> {
        throw new Error('Method not implemented.')
    }

    /** If users are unauthenticated in Q/CW, we should always display the auth screen. */
    async quitLoginScreen() {}

    private setupConnectionEventEmitter(): void {
        // allows the frontend to listen to Amazon Q auth events from the backend
        const codeWhispererConnectionChanged = createThrottle(() => this.onActiveConnectionModified.fire())
        AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(codeWhispererConnectionChanged)

        /**
         * Multiple events can be received in rapid succession and if
         * we execute on the first one it is possible to get a stale
         * state.
         */
        function createThrottle(callback: () => void) {
            return debounce(callback, 500)
        }
    }
}
