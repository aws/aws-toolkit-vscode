/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This module sets up the necessary components
 * for the webview to be shown.
 */
import globals from '../../../shared/extensionGlobals'
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
import { Auth } from '../../auth'
import { getCredentialFormatError, getCredentialsErrors } from '../../credentials/validation'
import { profileExists } from '../../credentials/sharedCredentials'
import { getLogger } from '../../../shared/logger'
import { AuthUtil as CodeWhispererAuth } from '../../../codewhisperer/util/authUtil'
import { CodeCatalystAuthenticationProvider } from '../../../codecatalyst/auth'
import { setupCodeCatalystBuilderId } from '../../../codecatalyst/utils'
import { ToolkitError } from '../../../shared/errors'
import {
    Connection,
    SsoConnection,
    createSsoProfile,
    isBuilderIdConnection,
    isIamConnection,
    isSsoConnection,
} from '../../connection'
import { tryAddCredentials, signout, showRegionPrompter, promptAndUseConnection, ExtensionUse } from '../../utils'
import { Region } from '../../../shared/regions/endpoints'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { validateSsoUrl, validateSsoUrlFormat } from '../../sso/validation'
import { debounce } from '../../../shared/utilities/functionUtils'
import { AuthError, ServiceItemId, userCancelled } from './types'
import { awsIdSignIn } from '../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../codewhisperer/util/getStartUrl'
import { trustedDomainCancellation } from '../../sso/model'
import { FeatureId, CredentialSourceId, Result, telemetry } from '../../../shared/telemetry/telemetry'
import { AuthFormId, isBuilderIdAuth } from './authForms/types'
import { handleWebviewError } from '../../../webviews/server'

export class AuthWebview extends VueWebview {
    public override id: string = 'authWebview'
    public override source: string = 'src/auth/ui/vue/index.js'
    public readonly onDidConnectionUpdate = new vscode.EventEmitter<undefined>()
    /** If the backend needs to tell the frontend to select/show a specific service to the user */
    public readonly onDidSelectService = new vscode.EventEmitter<ServiceItemId>()

    constructor(private readonly codeCatalystAuth: CodeCatalystAuthenticationProvider) {
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
        return (await Auth.instance.listAndTraverseConnections().promise()).find(isIamConnection) !== undefined
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

    editCredentialsFile() {
        return globals.awsContextCommands.onCommandEditCredentials()
    }

    async startCodeWhispererBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeWhispererBuilderIdSetup', () => awsIdSignIn())
    }

    async startCodeCatalystBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup('startCodeCatalystBuilderIdSetup', () => setupCodeCatalystBuilderId(this.codeCatalystAuth))
    }

    isCodeWhispererBuilderIdConnected(): boolean {
        return CodeWhispererAuth.instance.isBuilderIdInUse() && CodeWhispererAuth.instance.isConnectionValid()
    }

    isCodeCatalystBuilderIdConnected(): boolean {
        return this.codeCatalystAuth.isConnectionValid()
    }

    async signoutBuilderId(): Promise<void> {
        const builderIdConn = (await Auth.instance.listConnections()).find(isBuilderIdConnection)
        // this will fire events to signal the secondary auths
        await signout(Auth.instance, builderIdConn)
    }

    async showResourceExplorer(): Promise<void> {
        vscode.commands.executeCommand('aws.explorer.focus')
    }

    async showCodeWhispererNode(): Promise<void> {
        vscode.commands.executeCommand('aws.developerTools.showCodeWhisperer')
    }

    async showCodeCatalystNode(): Promise<void> {
        vscode.commands.executeCommand('aws.developerTools.showCodeCatalyst')
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
            if (
                CancellationError.isUserCancelled(e) ||
                (e instanceof ToolkitError && (CancellationError.isUserCancelled(e.cause) || e.cancelled === true))
            ) {
                return { id: userCancelled, text: 'Setup cancelled.' }
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
        const nonBuilderIdSsoConns = (await Auth.instance.listConnections()).find(conn =>
            this.isNonBuilderIdSsoConnection(conn)
        )
        return nonBuilderIdSsoConns !== undefined
    }

    isCodeWhispererIdentityCenterConnected(): boolean {
        return CodeWhispererAuth.instance.isEnterpriseSsoInUse() && CodeWhispererAuth.instance.isConnectionValid()
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

    async signoutIdentityCenter(): Promise<void> {
        const conn = Auth.instance.activeConnection
        const activeConn = this.isNonBuilderIdSsoConnection(conn) ? conn : undefined
        if (!activeConn) {
            getLogger().warn('authWebview: Attempted to signout of identity center when it was not being used')
            return
        }

        await signout(Auth.instance, activeConn)
    }

    private isNonBuilderIdSsoConnection(conn?: Connection): conn is SsoConnection {
        return isSsoConnection(conn) && !isBuilderIdConnection(conn)
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
        const events = [
            this.codeCatalystAuth.onDidChangeActiveConnection,
            CodeWhispererAuth.instance.secondaryAuth.onDidChangeActiveConnection,
            Auth.instance.onDidChangeActiveConnection,
            Auth.instance.onDidChangeConnectionState,
            Auth.instance.onDidUpdateConnection,
        ]

        // The event handler in the frontend refreshes all connection statuses
        // when triggered, and multiple events can fire at the same time so we debounce.
        const debouncedFire = debounce(() => this.onDidConnectionUpdate.fire(undefined), 500)

        events.forEach(event =>
            event(() => {
                debouncedFire()
            })
        )
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

    // -------------------- Telemetry Stuff --------------------

    async getConnectionCount(): Promise<number> {
        return (await Auth.instance.listConnections()).length
    }

    /** The number of auth connections when the webview first starts. We will diff this to see if new connections were added. */
    private initialNumConnections: number | undefined

    async setInitialNumConnections() {
        this.initialNumConnections = await this.getConnectionCount()
    }

    /** This represents the cause for the webview to open, wether a certain button was clicked or it opened automatically */
    #authSource?: AuthSource

    setSource(source: AuthSource | undefined) {
        if (this.#authSource) {
            return
        }
        this.#authSource = source
    }

    getSource(): AuthSource | undefined {
        return this.#authSource
    }

    /**
     * Represents the 'unlocked' tabs/auth areas in the UI
     *
     * We use this to get a high level view of what features are enabled/unlocked
     */
    private initialConnectedAuths: Set<AuthFormId> = new Set()
    setInitialConnectedAuths(auths: AuthFormId[]) {
        this.initialConnectedAuths = new Set(auths)
    }

    #allConnectedAuths: Set<AuthFormId> | undefined
    authFormSuccess(id: AuthFormId | undefined) {
        if (!id) {
            return
        }
        this.#allConnectedAuths ??= new Set(this.initialConnectedAuths)
        this.#allConnectedAuths.add(id)
    }
    getAllConnectedAuths(): Set<AuthFormId> {
        return (this.#allConnectedAuths ??= new Set())
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
    private previousFeatureType: FeatureId | undefined

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
    private async stopAuthFormInteraction(featureType: FeatureId, authType: CredentialSourceId) {
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

    async failedAuthAttempt(args: {
        authType: CredentialSourceId
        featureType: FeatureId
        reason: string
        invalidInputFields?: string[]
    }) {
        // Send metric about specific individual failure regardless
        telemetry.auth_addConnection.emit({
            source: this.#authSource ?? '',
            credentialSourceId: args.authType,
            featureId: args.featureType,
            result: args.reason === userCancelled ? 'Cancelled' : 'Failed',
            reason: args.reason,
            invalidInputFields: args.invalidInputFields
                ? builderCommaDelimitedString(args.invalidInputFields)
                : undefined,
            isAggregated: false,
        })

        if (
            this.#previousFailedAuth &&
            this.#previousFailedAuth.authType === args.authType &&
            this.#previousFailedAuth.featureType === args.featureType
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

    async successfulAuthAttempt(args: { authType: CredentialSourceId; featureType: FeatureId }) {
        // All previous failed attempts + 1 successful attempt
        const authAttempts = this.getPreviousAuthAttempts(args.featureType, args.authType) + 1
        this.emitAuthAttempt({
            authType: args.authType,
            featureType: args.featureType,
            result: 'Succeeded',
            attempts: authAttempts,
        })
    }

    #totalAuthAttempts: number = 0

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
            invalidInputFields: args.invalidFields ? builderCommaDelimitedString(args.invalidFields) : undefined,
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

    /**
     * The metric emitted when the webview is closed by the user.
     */
    async emitWebviewClosed() {
        if (this.previousFeatureType && this.previousAuthType) {
            // We are closing the webview, and have an auth form if they were
            // interacting but did not complete it.
            await this.stopAuthFormInteraction(this.previousFeatureType, this.previousAuthType)
        }

        const allConnectedAuths = this.getAllConnectedAuths()
        const newConnectedAuths = new Set(
            [...allConnectedAuths].filter(value => !this.initialConnectedAuths.has(value))
        )
        const uncountedBuilderIds = this.getUncountedBuilderIds(allConnectedAuths, newConnectedAuths)

        let numAuthConnections = (await this.getConnectionCount()) + uncountedBuilderIds
        let numNewAuthConnections = numAuthConnections - this.initialNumConnections! + uncountedBuilderIds

        if (numNewAuthConnections < 0) {
            // Edge Case:
            // numAuthConnections gets the latest number of connections, and it is
            // possible that the user signed out or removed connections they initially had.
            // If this is the case, we will set the total connections to what it initially was
            // since we don't consider removing connections as not having existed.
            numAuthConnections = this.initialNumConnections!
            numNewAuthConnections = newConnectedAuths.size // best effort guess but can be wrong
        }

        let result: Result

        if (numNewAuthConnections > 0) {
            result = 'Succeeded'
        } else if (this.#totalAuthAttempts > 0) {
            // There were no new auth connections added, but attempts were made
            result = 'Failed'
        } else {
            // No new auth connections added, but no attempts were made
            result = 'Cancelled'
        }

        if (this.getSource() === 'firstStartup' && numNewAuthConnections === 0) {
            if (this.initialNumConnections! > 0) {
                // This is the users first startup of the extension and no new connections were added, but they already had connections setup on their
                // system which we discovered. We consider this a success even though they added no new connections.
                result = 'Succeeded'
            } else {
                // A brand new user with no new auth connections did not add any
                // connections
                result = 'Failed'
            }
        }

        telemetry.auth_addedConnections.emit({
            source: this.getSource() ?? '',
            result,
            attempts: this.#totalAuthAttempts,
            reason: 'closedWebview',
            authConnectionsCount: numAuthConnections,
            newAuthConnectionsCount: numNewAuthConnections,
            enabledAuthConnections: builderCommaDelimitedString(allConnectedAuths),
            newEnabledAuthConnections: builderCommaDelimitedString(newConnectedAuths),
        })
    }

    /**
     * Additional Builder IDs don't count toward the total connection count,
     * since they are seen as 1 connection.
     *
     * This does some work to find the missing ones that were not considered.
     */
    private getUncountedBuilderIds(allAuths: Set<AuthFormId>, newAuths: Set<AuthFormId>) {
        const newBuilderIds = [...newAuths].filter(isBuilderIdAuth).length
        if (this.hadBuilderIdBefore(allAuths, newAuths)) {
            // Had a builder id so all new builder ids didn't get added.
            return newBuilderIds
        }
        // Didn't have builder id before, so only the first was added, but not the rest (hence -1)
        return newBuilderIds > 0 ? newBuilderIds - 1 : 0
    }

    private hadBuilderIdBefore(allAuths: Set<AuthFormId>, newAuths: Set<AuthFormId>) {
        const initialAuths = [...allAuths].filter(auth => !newAuths.has(auth))
        const initialBuilderIds = initialAuths.filter(isBuilderIdAuth)
        return initialBuilderIds.length > 0
    }

    /**
     * The metric when certain elements in the webview are clicked
     */
    emitUiClick(id: AuthUiClick) {
        telemetry.ui_click.emit({
            elementId: id,
        })
    }
}

export type AuthUiClick =
    | 'auth_signUpForFree'
    | 'auth_infoIAMIdentityCenter'
    | 'auth_learnMoreAWSResources'
    | 'auth_learnMoreCodeWhisperer'
    | 'auth_learnMoreCodeCatalyst'
    | 'auth_learnMoreBuilderId'
    | 'auth_learnMoreProfessionalTierCodeWhisperer'
    | 'auth_explorer_expandIAMIdentityCenter'
    | 'auth_explorer_expandIAMCredentials'
    | 'auth_codewhisperer_expandIAMIdentityCenter'
    | 'auth_openConnectionSelector'
    | 'auth_openAWSExplorer'
    | 'auth_openCodeWhisperer'
    | 'auth_openCodeCatalyst'
    | 'auth_editCredentials'
    | 'auth_codewhisperer_signoutBuilderId'
    | 'auth_codewhisperer_signoutIdentityCenter'
    | 'auth_codecatalyst_signoutBuilderId'
    | 'auth_explorer_signoutIdentityCenter'

// type AuthAreas = 'awsExplorer' | 'codewhisperer' | 'codecatalyst'

export function builderCommaDelimitedString(strings: Iterable<string>): string {
    const sorted = Array.from(new Set(strings)).sort((a, b) => a.localeCompare(b))
    return sorted.join(',')
}

const Panel = VueWebview.compilePanel(AuthWebview)
let activePanel: InstanceType<typeof Panel> | undefined
let subscriptions: vscode.Disposable[] | undefined

export type AuthSource =
    | 'addConnectionQuickPick'
    | 'firstStartup'
    | 'codecatalystDeveloperTools'
    | 'codewhispererDeveloperTools'
    | 'unknown'

export async function showAuthWebview(
    ctx: vscode.ExtensionContext,
    source: AuthSource,
    serviceToShow?: ServiceItemId
): Promise<void> {
    let wasInitialServiceSet = false
    if (activePanel && serviceToShow) {
        // Webview is already open, so we have to select the service
        // through an event
        activePanel.server.onDidSelectService.fire(serviceToShow)
        wasInitialServiceSet = true
    }

    const wasWebviewAlreadyOpen = !!activePanel

    activePanel ??= new Panel(ctx, CodeCatalystAuthenticationProvider.fromContext(ctx))

    if (!wasWebviewAlreadyOpen) {
        await activePanel.server.setInitialNumConnections()
    }

    if (!wasInitialServiceSet && serviceToShow) {
        // Webview does not exist yet, preemptively set
        // the initial service to show
        activePanel.server.setInitialService(serviceToShow)
    }

    activePanel.server.setSource(source)
    activePanel.server.setupConnectionChangeEmitter()

    const webview = await activePanel!.show({
        title: `${getIdeProperties().company} Toolkit: Add Connection to AWS`,
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
        retainContextWhenHidden: true,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                activePanel?.server.emitWebviewClosed()
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}
