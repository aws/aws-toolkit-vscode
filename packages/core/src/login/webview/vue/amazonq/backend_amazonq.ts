/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import {
    AwsConnection,
    Connection,
    SsoConnection,
    getTelemetryMetadataForConn,
    isSsoConnection,
} from '../../../../auth/connection'
import { AuthUtil } from '../../../../codewhisperer/util/authUtil'
import { CommonAuthWebview } from '../backend'
import { awsIdSignIn } from '../../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../../codewhisperer/util/getStartUrl'
import { activateExtension, isExtensionInstalled } from '../../../../shared/utilities/vsCodeUtils'
import { VSCODE_EXTENSION_ID } from '../../../../shared/extensions'
import { getLogger } from '../../../../shared/logger/logger'
import { debounce } from 'lodash'
import { AuthError, AuthFlowState, userCancelled } from '../types'
import { ToolkitError } from '../../../../shared/errors'
import { withTelemetryContext } from '../../../../shared/telemetry/util'
import { builderIdStartUrl } from '../../../../auth/sso/constants'
import { RegionProfile } from '../../../../codewhisperer/models/model'
import { randomUUID } from '../../../../shared/crypto'
import globals from '../../../../shared/extensionGlobals'
import { telemetry } from '../../../../shared/telemetry/telemetry'
import { ProfileSwitchIntent } from '../../../../codewhisperer/region/regionProfileManager'

const className = 'AmazonQLoginWebview'
export class AmazonQLoginWebview extends CommonAuthWebview {
    public override id: string = 'aws.amazonq.AmazonCommonAuth'
    public static sourcePath: string = 'vue/src/login/webview/vue/amazonq/index.js'
    public override supportsLoadTelemetry: boolean = true

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
        const importedApi = toolkitExt?.exports?.getApi(VSCODE_EXTENSION_ID.amazonq)
        if (importedApi && 'listConnections' in importedApi) {
            return ((await importedApi?.listConnections()) as AwsConnection[]).filter(
                // No need to display Builder ID as an existing connection,
                // users can just select the Builder ID login option and it would have the same effect.
                (conn) => conn.startUrl !== builderIdStartUrl
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

            const conn = await awsIdSignIn()
            this.storeMetricMetadata(await getTelemetryMetadataForConn(conn))

            void vscode.window.showInformationMessage('AmazonQ: Successfully connected to AWS Builder ID')
        })
    }

    async startEnterpriseSetup(startUrl: string, region: string): Promise<AuthError | undefined> {
        getLogger().debug(`called startEnterpriseSetup() with startUrl: '${startUrl}', region: '${region}'`)
        return await this.ssoSetup('startCodeWhispererEnterpriseSetup', async () => {
            this.storeMetricMetadata({
                credentialStartUrl: startUrl,
                credentialSourceId: 'iamIdentityCenter',
                authEnabledFeatures: 'codewhisperer',
                isReAuth: false,
            })

            const conn = await connectToEnterpriseSso(startUrl, region)
            this.storeMetricMetadata(await getTelemetryMetadataForConn(conn))

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
                throw new ToolkitError('Cannot reauthenticate non-existant connection.')
            }

            const conn = AuthUtil.instance.conn
            if (!isSsoConnection(conn)) {
                getLogger().error('amazon Q reauthenticate called, but the connection is not SSO')
                throw new ToolkitError('Cannot reauthenticate non-SSO connection.')
            }

            /**
             * IMPORTANT: During this process {@link this.onActiveConnectionModified} is triggered. This
             * causes the reauth page to refresh before the user is actually done the whole reauth flow.
             */
            this.reauthError = await this.ssoSetup('reauthenticateAmazonQ', async () => {
                this.storeMetricMetadata({
                    authEnabledFeatures: this.getAuthEnabledFeatures(conn),
                    isReAuth: true,
                    ...(await getTelemetryMetadataForConn(conn)),
                })
                await AuthUtil.instance.reauthenticate()
                this.storeMetricMetadata({
                    ...(await getTelemetryMetadataForConn(conn)),
                })
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
        } else if (featureAuthStates.amazonQ === 'pendingProfileSelection') {
            this.authState = 'PENDING_PROFILE_SELECTION'
            // possible that user starts with "profile selection" state therefore the timeout for auth flow should be disposed otherwise will emit failure
            this.loadMetadata?.loadTimeout?.dispose()
            this.loadMetadata = {
                traceId: randomUUID(),
                loadTimeout: undefined,
                start: globals.clock.Date.now(),
            }
            return
        }
        this.authState = 'LOGIN'
    }

    override async getAuthState(): Promise<AuthFlowState> {
        return this.authState
    }

    @withTelemetryContext({ name: 'signout', class: className })
    override async signout(): Promise<void> {
        const conn = AuthUtil.instance.secondaryAuth.activeConnection
        if (!isSsoConnection(conn)) {
            throw new ToolkitError(`Cannot signout non-SSO connection, type is: ${conn?.type}`)
        }

        this.storeMetricMetadata({
            authEnabledFeatures: this.getAuthEnabledFeatures(conn),
            isReAuth: true,
            ...(await getTelemetryMetadataForConn(conn)),
            result: 'Cancelled',
        })

        await AuthUtil.instance.secondaryAuth.deleteConnection()
        this.reauthError = undefined

        this.emitAuthMetric()
    }

    async listSsoConnections(): Promise<SsoConnection[]> {
        // Amazon Q only supports 1 connection at a time,
        // so there isn't a need to de-duplicate connections.
        return []
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

    /**
     * The purpose of returning Error.message is to notify vue frontend that API call fails and to render corresponding error message to users
     * @returns ProfileList when API call succeeds, otherwise Error.message
     */
    override async listRegionProfiles(): Promise<RegionProfile[] | string> {
        try {
            return await AuthUtil.instance.regionProfileManager.listRegionProfile()
        } catch (e) {
            const conn = AuthUtil.instance.conn as SsoConnection | undefined
            telemetry.amazonq_didSelectProfile.emit({
                source: 'auth',
                amazonQProfileRegion: AuthUtil.instance.regionProfileManager.activeRegionProfile?.region ?? 'not-set',
                ssoRegion: conn?.ssoRegion,
                result: 'Failed',
                credentialStartUrl: conn?.startUrl,
                reason: (e as Error).message,
            })

            return (e as Error).message
        }
    }

    override selectRegionProfile(profile: RegionProfile, source: ProfileSwitchIntent) {
        return AuthUtil.instance.regionProfileManager.switchRegionProfile(profile, source)
    }

    private setupConnectionEventEmitter(): void {
        // allows the frontend to listen to Amazon Q auth events from the backend
        const codeWhispererConnectionChanged = createThrottle(() => this.onActiveConnectionModified.fire())
        AuthUtil.instance.secondaryAuth.onDidChangeActiveConnection(codeWhispererConnectionChanged)
        AuthUtil.instance.regionProfileManager.onDidChangeRegionProfile(codeWhispererConnectionChanged)

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
