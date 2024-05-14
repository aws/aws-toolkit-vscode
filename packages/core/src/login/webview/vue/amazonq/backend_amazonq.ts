/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import {
    scopesCodeWhispererChat,
    AwsConnection,
    Connection,
    isSsoConnection,
    SsoConnection,
    isIdcSsoConnection,
    isBuilderIdConnection,
    scopesFeatureDev,
} from '../../../../auth/connection'
import { AuthUtil, amazonQScopes } from '../../../../codewhisperer/util/authUtil'
import { CommonAuthWebview } from '../backend'
import { awsIdSignIn } from '../../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../../codewhisperer/util/getStartUrl'
import { activateExtension, isExtensionInstalled } from '../../../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../../../shared/extensions'
import { getLogger } from '../../../../shared/logger'
import { Auth } from '../../../../auth'
import { ToolkitError } from '../../../../shared/errors'
import { debounce } from 'lodash'
import { AuthError, AuthFlowState, userCancelled } from '../types'
import { builderIdStartUrl } from '../../../../auth/sso/model'
import { isBuilderIdAuth } from '../../../../auth/ui/vue/authForms/types'

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
            getLogger().info(`auth: Retrieving connections from AWS Toolkit`)
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
    findUsableConnection(connections: AwsConnection[]): AwsConnection | undefined {
        return AuthUtil.instance.findUsableQConnection(connections)
    }

    /**
     * Attempts to re-use a valid connection in AWS Toolkit.
     * This logic should only apply to below users:
     * 1. They have a invalid builder id connection in Amazon Q that do not have all 5 scopes
     * For these users, if there is a valid builder id connection in AWS Toolkit,
     * We attempt to re-use this valid builder id connection.
     */
    async tryReuseConnectionFromAwsToolkit() {
        getLogger().debug(`auth: try to reuse connection in aws toolkit`)
        // fetch existing connections of AWS toolkit in Amazon Q
        // or fetch existing connections of Amazon Q in AWS Toolkit
        // to reuse connections in AWS Toolkit & Amazon Q
        const sharedConnections = await this.fetchConnections()

        const currentConnection = AuthUtil.instance.conn

        // Only when Amazon Q has no valid builder id connections while Toolkit has connections
        // Auto connect Q using toolkit connection.
        const shouldReuseToolkitConnection = () => {
            if (currentConnection === undefined) {
                return true
            }
            if (
                currentConnection.type === 'sso' &&
                AuthUtil.instance.isBuilderIdInUse() &&
                AuthUtil.instance.isConnectionExpired() &&
                !currentConnection.scopes?.includes(scopesFeatureDev[0]) &&
                currentConnection.scopes?.includes(scopesCodeWhispererChat[0])
            ) {
                return true
            }
            return false
        }
        if (shouldReuseToolkitConnection() && sharedConnections && sharedConnections.length > 0) {
            getLogger().debug(`auth: findUsableConnection in aws toolkit`)
            const conn = await this.findUsableConnection(sharedConnections)
            if (conn) {
                getLogger().debug(`auth: use connection from aws toolkit ${conn.id}`)
                await this.useConnection(conn.id, true)
            }
        }
    }

    async useConnection(connectionId: string, auto: boolean): Promise<AuthError | undefined> {
        getLogger().debug(`called useConnection() with connectionId: '${connectionId}', auto: '${auto}'`)
        return this.ssoSetup(
            'useConnection',
            async () => {
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
                                if (!auto) {
                                    this.storeMetricMetadata({
                                        // Hacky way to check for builder ID with AwsConnection interface
                                        credentialSourceId:
                                            conn.startUrl === builderIdStartUrl ? 'awsId' : 'iamIdentityCenter',
                                        credentialStartUrl: conn.startUrl,
                                        region: conn.ssoRegion,
                                        authEnabledFeatures: this.getAuthEnabledFeatures(conn),
                                    })
                                }
                                let newConn: SsoConnection
                                if (conn.scopes?.includes(scopesCodeWhispererChat[0])) {
                                    getLogger().info(
                                        `auth: re-use connection from existing connection id ${connectionId}`
                                    )
                                    newConn = await Auth.instance.createConnectionFromApi(conn)
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
                                    const payload: AwsConnection = {
                                        type: conn.type,
                                        ssoRegion: conn.ssoRegion,
                                        scopes: newScopes,
                                        startUrl: conn.startUrl,
                                        state: conn.state,
                                        id: conn.id,
                                        label: conn.label,
                                    }
                                    newConn = await Auth.instance.createConnectionFromApi(payload)
                                    try {
                                        await Auth.instance.reauthenticate(newConn, false)
                                    } catch (e) {
                                        // Restore original scopes as to not soft-lock connections.
                                        await Auth.instance.createConnectionFromApi({ ...payload, scopes: oldScopes })
                                        throw e
                                    }
                                    await AuthUtil.instance.secondaryAuth.useNewConnection(newConn)
                                }
                                if (!auto) {
                                    this.storeMetricMetadata({
                                        credentialStartUrl: conn.startUrl,
                                        region: conn.ssoRegion,
                                        authEnabledFeatures: this.getAuthEnabledFeatures(newConn),
                                    })
                                }
                            }
                        }
                    }
                } catch (e) {
                    throw ToolkitError.chain(e, 'Failed to add Amazon Q scope', {
                        code: 'FailedToConnect',
                    })
                }
            },
            !auto
        )
    }

    async startBuilderIdSetup(): Promise<AuthError | undefined> {
        getLogger().debug(`called startBuilderIdSetup()`)
        return await this.ssoSetup('startCodeWhispererBuilderIdSetup', async () => {
            this.storeMetricMetadata({
                credentialSourceId: 'awsId',
                authEnabledFeatures: 'codewhisperer',
                isReAuth: false,
            })

            await awsIdSignIn()
            void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS Builder ID')
        })
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        getLogger().debug(`called useConnection() with startUrl: '${startUrl}', region: '${region}'`)
        return await this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            this.storeMetricMetadata({
                credentialStartUrl: startUrl,
                region,
                credentialSourceId: 'iamIdentityCenter',
                authEnabledFeatures: 'codewhisperer',
                isReAuth: false,
            })

            await connectToEnterpriseSso(startUrl, region)
            void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS IAM Identity Center')
        })
    }

    async reauthenticateConnection(): Promise<void> {
        this.isReauthenticating = true
        this.reauthError = undefined

        try {
            // Sanity checks
            if (!AuthUtil.instance.isConnected()) {
                getLogger().error('amazon Q reauthenticate called on a non-existant connection')
            }

            if (!isSsoConnection(AuthUtil.instance.conn)) {
                getLogger().error('amazon Q reauthenticate called, but the connection is not SSO')
            }

            /**
             * IMPORTANT: During this process {@link this.onActiveConnectionModified} is triggered. This
             * causes the reauth page to refresh before the user is actually done the whole reauth flow.
             */
            this.reauthError = await this.ssoSetup('reauthenticate', async () => {
                this.storeMetricMetadata({
                    authEnabledFeatures: this.getAuthEnabledFeatures(AuthUtil.instance.conn as SsoConnection),
                    isReAuth: true,
                    ...this.getMetadataForExistingConn(),
                })
                await AuthUtil.instance.reauthenticate(true)
            })
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
        this.storeMetricMetadata({
            authEnabledFeatures: this.getAuthEnabledFeatures(
                AuthUtil.instance.secondaryAuth.activeConnection as SsoConnection
            ),
            isReAuth: true,
            ...this.getMetadataForExistingConn(),
            result: 'Cancelled',
        })

        await AuthUtil.instance.secondaryAuth.deleteConnection()
        this.reauthError = undefined

        this.emitAuthMetric()
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
