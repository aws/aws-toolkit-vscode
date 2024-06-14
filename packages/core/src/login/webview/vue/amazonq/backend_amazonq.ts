/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AwsConnection, Connection, isSsoConnection, SsoConnection } from '../../../../auth/connection'
import { AuthUtil } from '../../../../codewhisperer/util/authUtil'
import { CommonAuthWebview } from '../backend'
import { awsIdSignIn } from '../../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../../codewhisperer/util/getStartUrl'
import { activateExtension, isExtensionInstalled } from '../../../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../../../shared/extensions'
import { getLogger } from '../../../../shared/logger'
import { debounce } from 'lodash'
import { AuthError, AuthFlowState, userCancelled } from '../types'
import { builderIdStartUrl } from '../../../../auth/sso/model'

export class AmazonQLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.amazonq.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/amazonq/index.js'

    override onActiveConnectionModified = new vscode.EventEmitter<void>()

    constructor() {
        super(AmazonQLoginWebview.sourcePath)

        this.setupConnectionEventEmitter()
    }

    /**
     * Returns list of connections that are pushed from Toolkit to Amazon Q
     */
    async fetchConnections(): Promise<AwsConnection[] | undefined> {
        if (!isExtensionInstalled(VSCODE_EXTENSION_ID.awstoolkit)) {
            return undefined
        }
        await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const toolkitExt = vscode.extensions.getExtension(VSCODE_EXTENSION_ID.awstoolkit)
        const importedApi = toolkitExt?.exports.getApi(VSCODE_EXTENSION_ID.amazonq)
        if (importedApi && 'listConnections' in importedApi) {
            return ((await importedApi?.listConnections()) as AwsConnection[]).filter(
                // No need to display Builder ID as an existing connection,
                // users can just select the Builder ID login option and it would have the same effect.
                conn => conn.startUrl !== builderIdStartUrl
            )
        }
        return []
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
        getLogger().debug(`called startEnterpriseSetup() with startUrl: '${startUrl}', region: '${region}'`)
        return await this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            this.storeMetricMetadata({
                credentialStartUrl: startUrl,
                awsRegion: region,
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
                await AuthUtil.instance.reauthenticate()
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
