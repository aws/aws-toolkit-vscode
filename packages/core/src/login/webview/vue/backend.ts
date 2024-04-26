/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'
import { Region } from '../../../shared/regions/endpoints'
import { ToolkitError } from '../../../shared/errors'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { trustedDomainCancellation } from '../../../auth/sso/model'
import { handleWebviewError } from '../../../webviews/server'
import { InvalidGrantException } from '@aws-sdk/client-sso-oidc'
import { AwsConnection, Connection, SsoConnection } from '../../../auth/connection'
import { Auth } from '../../../auth/auth'
import { StaticProfile, StaticProfileKeyErrorMessage } from '../../../auth/credentials/types'
import { telemetry } from '../../../shared/telemetry'
import { AuthSources } from '../util'
import { AuthAddConnection } from '../../../shared/telemetry/telemetry'
import { AuthFlowState, AuthUiClick, userCancelled } from './types'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'

type Writeable<T> = { -readonly [U in keyof T]: T[U] }
export type TelemetryMetadata = Partial<Writeable<AuthAddConnection>>
export type AuthError = { id: string; text: string }

export abstract class CommonAuthWebview extends VueWebview {
    private metricMetadata: TelemetryMetadata = {}

    // authSource should be set by whatever triggers the auth page flow.
    // It will be reported in telemetry.
    static #authSource: string = AuthSources.vscodeComponent

    public static get authSource() {
        return CommonAuthWebview.#authSource
    }

    public static set authSource(source: string) {
        CommonAuthWebview.#authSource = source
    }

    public get authSource() {
        return CommonAuthWebview.#authSource
    }

    public set authSource(source: string) {
        CommonAuthWebview.#authSource = source
    }

    public getRegions(): Region[] {
        return globals.regionProvider.getRegions().reverse()
    }

    /**
     * This wraps the execution of the given setupFunc() and handles common errors from the SSO setup process.
     *
     * @param methodName A value that will help identify which high level function called this method.
     * @param setupFunc The function which will be executed in a try/catch so that we can handle common errors.
     * @returns
     */
    async ssoSetup(
        methodName: string,
        telemetryMetadata: TelemetryMetadata | undefined,
        setupFunc: () => Promise<any>
    ) {
        const runSetup = async () => {
            try {
                await setupFunc()
                return
            } catch (e) {
                console.log(e)
                if (e instanceof ToolkitError && e.code === 'NotOnboarded') {
                    /**
                     * Connection is fine, they just skipped onboarding so not an actual error.
                     *
                     * The error comes from user cancelling prompt by {@link CodeCatalystAuthenticationProvider.promptOnboarding()}
                     */
                    return
                }

                if (
                    CancellationError.isUserCancelled(e) ||
                    (e instanceof ToolkitError && (CancellationError.isUserCancelled(e.cause) || e.cancelled === true))
                ) {
                    return { id: userCancelled, text: 'Setup cancelled.' }
                }

                if (e instanceof ToolkitError && e.cause instanceof InvalidGrantException) {
                    return {
                        id: 'invalidGrantException',
                        text: 'Permissions for this service may not be enabled by your SSO Admin, or the selected region may not be supported.',
                    }
                }

                if (
                    e instanceof ToolkitError &&
                    (e.code === trustedDomainCancellation || e.cause?.name === trustedDomainCancellation)
                ) {
                    return {
                        id: 'trustedDomainCancellation',
                        text: `Must 'Open' or 'Configure Trusted Domains', unless you cancelled.`,
                    }
                }

                const invalidRequestException = 'InvalidRequestException'
                if (
                    (e instanceof Error && e.name === invalidRequestException) ||
                    (e instanceof ToolkitError && e.cause?.name === invalidRequestException)
                ) {
                    return { id: 'badStartUrl', text: `Connection failed. Please verify your start URL.` }
                }

                // If SSO setup fails we want to be able to show the user an error in the UI, due to this we cannot
                // throw an error here. So instead this will additionally show an error message that provides more
                // detailed information.
                handleWebviewError(e, this.id, methodName)

                return { id: 'defaultFailure', text: 'Failed to setup.' }
            }
        }

        const result = await runSetup()
        if (telemetryMetadata !== undefined) {
            this.emitAuthMetric({ ...telemetryMetadata, ...this.getResultForMetrics(result) })
        }
        return result
    }

    /** Allows the frontend to subscribe to events emitted by the backend regarding the ACTIVE auth connection changing in some way. */
    abstract onActiveConnectionModified: vscode.EventEmitter<void>

    abstract startBuilderIdSetup(app: string): Promise<AuthError | undefined>

    abstract startEnterpriseSetup(startUrl: string, region: string, app: string): Promise<AuthError | undefined>

    async getAuthenticatedCredentialsError(data: StaticProfile): Promise<StaticProfileKeyErrorMessage | undefined> {
        return Auth.instance.authenticateData(data)
    }

    abstract startIamCredentialSetup(
        profileName: string,
        accessKey: string,
        secretKey: string
    ): Promise<AuthError | undefined>

    async showResourceExplorer(): Promise<void> {
        await vscode.commands.executeCommand('aws.explorer.focus')
    }

    abstract fetchConnections(): Promise<AwsConnection[] | undefined>

    abstract useConnection(connectionId: string): Promise<AuthError | undefined>

    abstract findConnection(connections: AwsConnection[]): AwsConnection | undefined

    abstract errorNotification(e: AuthError): void

    abstract quitLoginScreen(): Promise<void>

    /**
     * NOTE: If we eventually need to be able to specify the connection to reauth, it should
     * be an arg in this function
     */
    abstract reauthenticateConnection(): Promise<void>
    abstract getReauthError(): Promise<AuthError | undefined>

    abstract getActiveConnection(): Promise<Connection | undefined>

    /** Refreshes the current state of the auth flow, determining what you see in the UI */
    abstract refreshAuthState(): Promise<void>
    /** Use {@link refreshAuthState} first to ensure this returns the latest state */
    abstract getAuthState(): Promise<AuthFlowState>

    abstract signout(): Promise<void>

    async listConnections(): Promise<Connection[]> {
        return Auth.instance.listConnections()
    }

    /**
     * Emit metric metadata.
     */
    emitAuthMetric(metadata: Partial<AuthAddConnection>) {
        telemetry.auth_addConnection.emit({
            ...metadata,
            source: this.authSource,
        })
    }

    /**
     * To be used by login.vue to report incremental changes about the auth flow. E.g., record 'startUrl' when
     * a startUrl is entered by the user.
     * Generally, telemetry is reported after a connection is established, so incremental reporting is not needed.
     * However, UI elements can indicate that a user cancelled the flow, e.g. leaving, back button, etc.
     * For these cases, we dump everything that we have reported via the login form since we wouldn't otherwise
     * be know what the form was going to submit.
     */
    storeMetricMetadata(data: TelemetryMetadata) {
        // We shouldn't report startUrl or region if we aren't reporting IdC
        if (data.credentialSourceId !== 'iamIdentityCenter') {
            data.region = undefined
            data.credentialStartUrl = undefined
        }
        this.metricMetadata = { ...this.metricMetadata, ...data }
    }

    /**
     * Emit stored metric metadata in the event of an auth form cancellation.
     */
    emitCancelledMetric(reauth: boolean) {
        if (reauth) {
            this.emitAuthMetric({ ...this.getMetadataForReauthMetrics(), isReAuth: false, result: 'Cancelled' })
        } else {
            this.emitAuthMetric({ ...this.metricMetadata, result: 'Cancelled' })
        }
    }

    /**
     * Reset metadata stored by the auth form.
     */
    resetStoredMetricMetadata() {
        this.metricMetadata = {}
    }

    /**
     * Determines the status of the metric to report.
     */
    getResultForMetrics(error?: AuthError) {
        const metadata: Partial<TelemetryMetadata> = {}
        if (error) {
            if (error.id === userCancelled) {
                metadata.result = 'Cancelled'
            } else {
                metadata.result = 'Failed'
                metadata.reason = error.text
            }
        } else {
            metadata.result = 'Succeeded'
        }

        return metadata
    }

    /**
     * Get metadata about the current auth for reauthentication telemetry.
     */
    getMetadataForReauthMetrics(): TelemetryMetadata {
        return {
            authEnabledFeatures: 'codewhisperer',
            isReAuth: true,
            ...(AuthUtil.instance.isBuilderIdInUse()
                ? {
                      credentialSourceId: 'awsId',
                  }
                : {
                      credentialSourceId: 'iamIdentityCenter',
                      credentialStartUrl: (AuthUtil.instance.conn as SsoConnection).startUrl,
                      region: (AuthUtil.instance.conn as SsoConnection).ssoRegion,
                  }),
        }
    }

    /**
     * The metric when certain elements in the webview are clicked.
     */
    emitUiClick(id: AuthUiClick) {
        telemetry.ui_click.emit({
            elementId: id,
        })
    }
}
