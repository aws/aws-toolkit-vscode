/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module sets up the necessary components
 * for the webview to be shown.
 */
import globals from '../../../shared/extensionGlobals'
import { VueWebview } from '../../../webviews/main'
import * as vscode from 'vscode'
import {
    CredentialsData,
    CredentialsKey,
    SectionName,
    StaticProfile,
    StaticProfileKeyErrorMessage,
} from '../../../auth/credentials/types'
import { Auth } from '../../../auth/auth'
import { getCredentialFormatError, getCredentialsErrors } from '../../../auth/credentials/validation'
import { profileExists } from '../../../auth/credentials/sharedCredentials'
import { getLogger } from '../../../shared/logger'
import { AuthUtil as CodeWhispererAuth } from '../../../codewhisperer/util/authUtil'
import { CodeCatalystAuthenticationProvider } from '../../../codecatalyst/auth'
import { ToolkitError } from '../../../shared/errors'
import { createSsoProfile, isBuilderIdConnection, isIdcSsoConnection } from '../../../auth/connection'
import {
    tryAddCredentials,
    signout,
    showRegionPrompter,
    promptAndUseConnection,
    ExtensionUse,
    hasIamCredentials,
    hasBuilderId,
    hasSso,
    BuilderIdKind,
    findSsoConnections,
} from '../../../auth/utils'
import { Region } from '../../../shared/regions/endpoints'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { validateSsoUrl, validateSsoUrlFormat } from '../../../auth/sso/validation'
import { awsIdSignIn } from '../../../codewhisperer/util/showSsoPrompt'
import { AuthError, ServiceItemId, authFormTelemetryMapping, userCancelled } from './types'
import { connectToEnterpriseSso } from '../../../codewhisperer/util/getStartUrl'
import { trustedDomainCancellation } from '../../../auth/sso/model'
import { FeatureId, CredentialSourceId, Result, telemetry } from '../../../shared/telemetry/telemetry'
import { AuthFormId } from './authForms/types'
import { handleWebviewError } from '../../../webviews/server'
import { placeholder } from '../../../shared/vscode/commands2'
import { debounce } from 'lodash'
import { submitFeedback } from '../../../feedback/vue/submitFeedback'
import { InvalidGrantException } from '@aws-sdk/client-sso-oidc'
import { AuthSource, buildCommaDelimitedString, focusAmazonQPanel } from '../../../auth/ui/vue/show'

export class AuthWebview extends VueWebview {
    public override id: string = 'authWebview'
    public override source: string = 'src/auth/ui/vue/index.js'
    public readonly onDidConnectionChangeCodeCatalyst = new vscode.EventEmitter<void>()
    public readonly onDidConnectionChangeExplorer = new vscode.EventEmitter<void>()
    public readonly onDidConnectionChangeCodeWhisperer = new vscode.EventEmitter<void>()
    /** If the backend needs to tell the frontend to select/show a specific service to the user */
    public readonly onDidSelectService = new vscode.EventEmitter<ServiceItemId>()

    constructor(private readonly codeCatalystAuth: CodeCatalystAuthenticationProvider, readonly auth = Auth.instance) {
        super()
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
        return getCredentialFormatError(key, value)
    }

    getCredentialsSubmissionErrors(data: CredentialsData): CredentialsData | undefined {
        return getCredentialsErrors(data)
    }

    /**
     * @returns true if successfully added credentials
     */
    async trySubmitCredentials(profileName: SectionName, data: StaticProfile): Promise<boolean> {
        try {
            await tryAddCredentials(profileName, data, true)
            return true
        } catch (e) {
            getLogger().error('Failed submitting credentials', e)
            return false
        }
    }

    /**
     * Returns true if any credentials are found, including those discovered from SSO service API.
     */
    async isCredentialExists(): Promise<boolean> {
        return hasIamCredentials()
    }

    async isExplorerConnected(type: 'idc' | 'iam') {
        if (type === 'idc') {
            // Explorer only cares a valid IdC exists, it doesn't have to be
            // in use since we really just want the credentials derived from it.
            const idcConns = await findSsoConnections('any')
            const validIdcConns = idcConns.filter(conn => {
                return this.auth.getConnectionState(conn) === 'valid'
            })
            return validIdcConns.length > 0
        } else {
            const conn = this.auth.activeConnection

            if (!conn) {
                return false
            }

            return conn.type === 'iam' && this.auth.getConnectionState(conn) === 'valid'
        }
    }

    async getAuthenticatedCredentialsError(data: StaticProfile): Promise<StaticProfileKeyErrorMessage | undefined> {
        return Auth.instance.authenticateData(data)
    }

    editCredentialsFile() {
        return globals.awsContextCommands.onCommandEditCredentials()
    }

    async startCodeWhispererBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererBuilderIdSetup', () => awsIdSignIn())
    }

    async startCodeCatalystBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeCatalystBuilderIdSetup', () => this.codeCatalystAuth.connectToAwsBuilderId())
    }

    async startCodeCatalystIdentityCenterSetup(startUrl: string, regionId: Region['id']) {
        return this.ssoSetup('startCodeCatalystIdentityCenterSetup', () => {
            return this.codeCatalystAuth.connectToEnterpriseSso(startUrl, regionId)
        })
    }

    isCodeWhispererBuilderIdConnected(): boolean {
        return CodeWhispererAuth.instance.isBuilderIdInUse() && CodeWhispererAuth.instance.isConnectionValid()
    }

    hasBuilderId(kind: BuilderIdKind): Promise<boolean> {
        return hasBuilderId(kind)
    }

    isCodeCatalystBuilderIdConnected(): boolean {
        return this.codeCatalystAuth.isBuilderIdInUse() && this.codeCatalystAuth.isConnectionValid()
    }

    async signoutBuilderId(): Promise<void> {
        const builderIdConn = (await Auth.instance.listConnections()).find(isBuilderIdConnection)
        // this will fire events to signal the secondary auths
        await signout(Auth.instance, builderIdConn)
    }

    async showResourceExplorer(): Promise<void> {
        await vscode.commands.executeCommand('aws.explorer.focus')
    }

    async showCodeWhispererView(): Promise<void> {
        await vscode.commands.executeCommand('aws.codewhisperer.focus')
    }

    async showCodeCatalystNode(): Promise<void> {
        await vscode.commands.executeCommand('aws.codecatalyst.maybeFocus')
    }

    async showAmazonQChat(): Promise<void> {
        return focusAmazonQPanel()
    }

    async getIdentityCenterRegion(): Promise<Region | undefined> {
        try {
            return await showRegionPrompter()
        } catch (e) {
            if (CancellationError.isUserCancelled(e)) {
                return undefined
            }
            throw e
        }
    }

    /**
     * Creates an Identity Center connection but does not 'use' it.
     */
    async createIdentityCenterConnection(startUrl: string, regionId: Region['id']): Promise<AuthError | undefined> {
        const setupFunc = async () => {
            const ssoProfile = createSsoProfile(startUrl, regionId)
            await Auth.instance.createConnection(ssoProfile)
        }
        return this.ssoSetup('createIdentityCenterConnection', setupFunc)
    }

    /**
     * Sets up the CW Identity Center connection.
     */
    async startCWIdentityCenterSetup(startUrl: string, regionId: Region['id']) {
        const setupFunc = () => {
            return connectToEnterpriseSso(startUrl, regionId)
        }
        return this.ssoSetup('startCWIdentityCenterSetup', setupFunc)
    }

    /**
     * This wraps the execution of the given setupFunc() and handles common errors from the SSO setup process.
     *
     * @param methodName A value that will help identify which high level function called this method.
     * @param setupFunc The function which will be executed in a try/catch so that we can handle common errors.
     * @returns
     */
    private async ssoSetup(methodName: string, setupFunc: () => Promise<any>): Promise<AuthError | undefined> {
        try {
            await setupFunc()
            return
        } catch (e) {
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

    /**
     * Checks if a non-BuilderId Identity Center connection exists, it
     * does not have to be active.
     */
    async isIdentityCenterExists(): Promise<boolean> {
        return hasSso('any')
    }

    isCodeWhispererIdentityCenterConnected(): boolean {
        return CodeWhispererAuth.instance.isEnterpriseSsoInUse() && CodeWhispererAuth.instance.isConnectionValid()
    }

    isCodeCatalystIdentityCenterConnected(): boolean {
        return this.codeCatalystAuth.isEnterpriseSsoInUse() && this.codeCatalystAuth.isConnectionValid()
    }

    isCodeCatalystIdCExists(): Promise<boolean> {
        return hasSso('codecatalyst')
    }

    isCodeWhispererIdCExists(): Promise<boolean> {
        return hasSso('codewhisperer')
    }

    async signoutCWIdentityCenter(): Promise<void> {
        const activeConn = CodeWhispererAuth.instance.isEnterpriseSsoInUse()
            ? CodeWhispererAuth.instance.conn
            : undefined
        if (!activeConn) {
            // At this point CW is not actively using IAM IC,
            // even if a valid IAM IC profile exists. We only
            // want to sign out if it being actively used.
            getLogger().warn('authWebview: Attempted to signout of CW identity center when it was not being used')
            return
        }

        await CodeWhispererAuth.instance.secondaryAuth.deleteConnection()
    }

    async signoutCodeCatalystIdentityCenter(): Promise<void> {
        const activeConn = this.codeCatalystAuth.isEnterpriseSsoInUse()
            ? this.codeCatalystAuth.activeConnection
            : undefined
        if (!activeConn) {
            // At this point CC is not actively using IAM IC,
            // even if a valid IAM IC profile exists. We only
            // want to sign out if it being actively used.
            getLogger().warn(
                'authWebview: Attempted to signout of CodeCatalyst identity center when it was not being used'
            )
            return
        }

        await this.codeCatalystAuth.secondaryAuth.deleteConnection()
    }

    async signoutIdentityCenter(): Promise<void> {
        const conn = Auth.instance.activeConnection
        const activeConn = isIdcSsoConnection(conn) ? conn : undefined
        if (!activeConn) {
            getLogger().warn('authWebview: Attempted to signout of identity center when it was not being used')
            return
        }

        await signout(Auth.instance, activeConn)
    }

    getSsoUrlError(url: string | undefined, canUrlExist: boolean = true) {
        if (!url) {
            return
        }
        if (canUrlExist) {
            // Url is allowed to already exist, so we only check the format
            return validateSsoUrlFormat(url)
        }
        return validateSsoUrl(Auth.instance, url)
    }

    /**
     * Sets up {@link onDidConnectionUpdate} to emit auth change events
     * that happen outside of the webview (eg: status bar > quickpick).
     */
    setupConnectionChangeEmitter() {
        const codeWhispererConnectionChanged = createThrottle(() => this.onDidConnectionChangeCodeWhisperer.fire())
        CodeWhispererAuth.instance.secondaryAuth.onDidChangeActiveConnection(codeWhispererConnectionChanged)

        const codeCatalystConnectionChanged = createThrottle(() => this.onDidConnectionChangeCodeCatalyst.fire())
        this.codeCatalystAuth.onDidChangeActiveConnection(codeCatalystConnectionChanged)

        const awsExplorerConnectionChanged = createThrottle(() => this.onDidConnectionChangeExplorer.fire())
        Auth.instance.onDidChangeActiveConnection(awsExplorerConnectionChanged)
        Auth.instance.onDidChangeConnectionState(awsExplorerConnectionChanged)
        Auth.instance.onDidUpdateConnection(awsExplorerConnectionChanged)

        /**
         * Multiple events can be received in rapid succession and if
         * we execute on the first one it is possible to get a stale
         * state.
         */
        function createThrottle(callback: () => void) {
            return debounce(callback, 500)
        }
    }

    #initialService?: ServiceItemId

    /**
     * Sets which service will be initially shown to the user
     */
    setInitialService(id: ServiceItemId) {
        this.#initialService = id
    }

    /**
     * The method for the frontend to use to know which service it should initially
     * show the user.
     */
    getInitialService(): ServiceItemId | undefined {
        const initialService = this.#initialService
        this.#initialService = undefined // consecutive requests will not do anything
        return initialService
    }

    showConnectionQuickPick() {
        return promptAndUseConnection(Auth.instance)
    }

    isExtensionFirstUse(): boolean {
        return ExtensionUse.instance.isFirstUse()
    }

    openFeedbackForm() {
        return submitFeedback.execute(placeholder, 'AWS Toolkit')
    }

    // -------------------- Telemetry Stuff --------------------
    // We will want to move this in to its own class once we make it possible with webviews

    /** This represents the cause for the webview to open, whether a certain button was clicked or it opened automatically */
    #authSource?: AuthSource
    setSource(source: AuthSource) {
        if (this.#authSource) {
            return
        }
        this.#authSource = source
    }
    getSource(): AuthSource | undefined {
        return this.#authSource
    }

    /**
     * All auths that existed prior to the webview being opened.
     */
    #authsInitial: Set<AuthFormId> = new Set()
    setAuthsInitial(auths: AuthFormId[]) {
        this.#authsInitial = new Set(auths)
    }
    getAuthsInitial() {
        return new Set(this.#authsInitial)
    }
    /** All auths that currently exist */
    #authsAdded: AuthFormId[] = []
    addSuccessfulAuth(id: AuthFormId) {
        this.#authsAdded.push(id)
    }
    getAuthsAdded(): AuthFormId[] {
        return [...this.#authsAdded] // make a copy
    }

    /**
     * This keeps track of the current auth form fields that have invalid values.
     *
     * We use this to hold on to this information since we may need it at a later time.
     */
    private previousInvalidFields: string[] | undefined
    setInvalidInputFields(fields: string[]) {
        this.previousInvalidFields = fields
    }

    /**
     * These properties represent the last auth form that we interacted with
     * that was not successfully completed.
     *
     * Eg: Builder ID for CodeWhisperer, Credentials for AWS Explorer
     */
    private previousAuthType: CredentialSourceId | undefined
    getPreviousAuthType(): CredentialSourceId | undefined {
        return this.previousAuthType
    }
    private previousFeatureType: FeatureId | undefined
    getPreviousFeatureType(): FeatureId | undefined {
        return this.previousFeatureType
    }

    /**
     * This function is called whenever some sort of user interaction with an auth form happens in
     * the webview. This helps keeps track of the auth form that was last interacted with.
     *
     * If a user starts interacting with a new form without successfully completing the
     * 'previous' one, this this will emit a metric related to an **unsuccessful** connection
     * attempt related to the previous auth form.
     */
    async startAuthFormInteraction(featureType: FeatureId, authType: CredentialSourceId) {
        if (
            this.previousFeatureType !== undefined &&
            this.previousAuthType !== undefined &&
            (this.previousFeatureType !== featureType || this.previousAuthType !== authType)
        ) {
            // At this point a user WAS previously interacting with a different auth form
            // and started interacting with a new one (hence the different feature + auth type).
            // We can now emit the result of the previous auth form.
            await this.stopAuthFormInteraction(this.previousFeatureType, this.previousAuthType)
        }

        this.previousAuthType = authType
        this.previousFeatureType = featureType
    }

    /**
     * The metric for when an auth form that was unsuccessfully interacted with is
     * done being interacted with
     */
    async stopAuthFormInteraction(featureType: FeatureId, authType: CredentialSourceId) {
        if (
            this.#previousFailedAuth &&
            this.#previousFailedAuth.featureType === featureType &&
            this.#previousFailedAuth.authType === authType
        ) {
            // The form we are ending interaction with had failed connection attempts. We will count this as a failure.
            await this.emitAuthAttempt({
                authType,
                featureType,
                result: 'Failed',
                reason: this.#previousFailedAuth.reason,
                invalidFields: this.#previousFailedAuth.invalidInputFields,
                attempts: this.getPreviousAuthAttempts(featureType, authType),
            })
        } else {
            await this.emitAuthAttempt({
                authType,
                featureType,
                result: 'Cancelled',
                invalidFields: this.previousInvalidFields,
                attempts: this.getPreviousAuthAttempts(featureType, authType),
            })
        }

        this.#previousFailedAuth = undefined
        this.previousInvalidFields = undefined
    }

    #previousFailedAuth:
        | {
              authType: CredentialSourceId
              featureType: FeatureId
              reason: string
              invalidInputFields: string[] | undefined
              attempts: number
          }
        | undefined

    async failedAuthAttempt(
        id: AuthFormId,
        args: {
            reason: string
            invalidInputFields?: string[]
        }
    ) {
        const mapping = authFormTelemetryMapping[id]
        const featureType = mapping.featureType
        const authType = mapping.authType

        // Send metric about specific individual failure regardless
        telemetry.auth_addConnection.emit({
            source: this.#authSource ?? '',
            credentialSourceId: authType,
            featureId: featureType,
            result: args.reason === userCancelled ? 'Cancelled' : 'Failed',
            reason: args.reason,
            invalidInputFields: args.invalidInputFields
                ? buildCommaDelimitedString(args.invalidInputFields)
                : undefined,
            isAggregated: false,
        })

        if (
            this.#previousFailedAuth &&
            this.#previousFailedAuth.authType === authType &&
            this.#previousFailedAuth.featureType === featureType
        ) {
            // Another failed attempt on same auth + feature. Update with newest failure info.
            this.#previousFailedAuth = {
                ...this.#previousFailedAuth,
                ...args,
                attempts: this.#previousFailedAuth.attempts + 1,
            }
        } else {
            // A new failed attempt on a new auth + feature
            this.#previousFailedAuth = {
                authType,
                featureType,
                invalidInputFields: undefined, // args may not have this field, so we set the default
                ...args,
                attempts: 1,
            }
        }
    }

    /** Returns the number of failed attempts for the given auth form */
    getPreviousAuthAttempts(featureType: FeatureId, authType: CredentialSourceId) {
        if (
            this.#previousFailedAuth &&
            this.#previousFailedAuth.featureType === featureType &&
            this.#previousFailedAuth.authType === authType
        ) {
            return this.#previousFailedAuth.attempts
        }
        return 0
    }

    async successfulAuthAttempt(id: AuthFormId) {
        if (id === 'aggregateExplorer') {
            throw new ToolkitError('This should not be called for the aggregate explorer')
        }

        const mapping = authFormTelemetryMapping[id]
        const featureType = mapping.featureType
        const authType = mapping.authType

        // All previous failed attempts + 1 successful attempt
        const authAttempts = this.getPreviousAuthAttempts(featureType, authType) + 1
        this.emitAuthAttempt({
            authType,
            featureType,
            result: 'Succeeded',
            attempts: authAttempts,
        }).catch(e => {
            getLogger().error('emitAuthAttempt failed: %s', (e as Error).message)
        })
        this.addSuccessfulAuth(id)
    }

    #totalAuthAttempts: number = 0
    getTotalAuthAttempts() {
        return this.#totalAuthAttempts
    }

    /**
     * This metric is emitted on an attempt to signin/connect/submit auth regardless
     * of success.
     */
    private async emitAuthAttempt(args: {
        authType: CredentialSourceId
        featureType: FeatureId
        result: Result
        reason?: string
        invalidFields?: string[]
        attempts: number
    }) {
        telemetry.auth_addConnection.emit({
            source: this.#authSource ?? '',
            credentialSourceId: args.authType,
            featureId: args.featureType,
            result: args.result,
            reason: args.reason,
            invalidInputFields: args.invalidFields ? buildCommaDelimitedString(args.invalidFields) : undefined,
            attempts: args.attempts,
            isAggregated: true,
        })

        this.#totalAuthAttempts += args.attempts

        if (args.result === 'Succeeded') {
            // Clear the variables that track the previous uncompleted auth form
            // since this was successfully completed.
            this.previousAuthType = undefined
            this.previousFeatureType = undefined
            this.#previousFailedAuth = undefined
        }
    }
}
