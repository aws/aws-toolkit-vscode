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
import { getStartedCommand, setupCodeCatalystBuilderId } from '../../../codecatalyst/utils'
import { ToolkitError } from '../../../shared/errors'
import {
    Connection,
    SsoConnection,
    createSsoProfile,
    isBuilderIdConnection,
    isIamConnection,
    isSsoConnection,
} from '../../connection'
import { tryAddCredentials, signout, showRegionPrompter, addConnection, promptAndUseConnection } from '../../utils'
import { Region } from '../../../shared/regions/endpoints'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { validateSsoUrl, validateSsoUrlFormat } from '../../sso/validation'
import { throttle } from '../../../shared/utilities/functionUtils'
import { DevSettings } from '../../../shared/settings'
import { showSsoSignIn } from '../../../codewhisperer/commands/basicCommands'
import { AuthError, ServiceItemId, userCancelled } from './types'
import { awsIdSignIn } from '../../../codewhisperer/util/showSsoPrompt'
import { connectToEnterpriseSso } from '../../../codewhisperer/util/getStartUrl'
import { trustedDomainCancellation } from '../../sso/model'
import { ExtensionUse } from '../../../shared/utilities/vsCodeUtils'
import { AuthUiElement, CredentialSourceId, Result, telemetry } from '../../../shared/telemetry/telemetry'

const logger = getLogger()
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
        getLogger().warn('getCredentialFormatError(): %s %s', key, value)
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
            if (!(e instanceof Error)) {
                return false
            }
            telemetry.auth_addConnection.emit({
                source: this.getSource() || '',
                credentialSourceId: 'sharedCredentials',
                result: 'Failed',
                reason: e.message,
            })
            return false
        }
    }

    /**
     * Returns true if any credentials are found, even ones associated with an sso
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
        return this.ssoSetup(() => awsIdSignIn())
    }

    async startCodeCatalystBuilderIdSetup(): Promise<AuthError | undefined> {
        return this.ssoSetup(() => setupCodeCatalystBuilderId(this.codeCatalystAuth))
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

    async showResourceExplorer(): Promise<void> {
        vscode.commands.executeCommand('aws.explorer.focus')
    }

    async showCodeWhispererNode(): Promise<void> {
        vscode.commands.executeCommand('aws.developerTools.showCodeWhisperer')
    }

    async showCodeCatalystNode(): Promise<void> {
        vscode.commands.executeCommand('aws.developerTools.showCodeCatalyst')
    }

    async getIdentityCenterRegion(): Promise<Region> {
        return showRegionPrompter()
    }

    /**
     * Creates an Identity Center connection but does not 'use' it.
     */
    async createIdentityCenterConnection(startUrl: string, regionId: Region['id']): Promise<AuthError | undefined> {
        const setupFunc = async () => {
            const ssoProfile = createSsoProfile(startUrl, regionId)
            await Auth.instance.createConnection(ssoProfile)
        }
        return this.ssoSetup(setupFunc)
    }

    /**
     * Sets up the CW Identity Center connection.
     */
    async startCWIdentityCenterSetup(startUrl: string, regionId: Region['id']) {
        const setupFunc = () => {
            return connectToEnterpriseSso(startUrl, regionId)
        }
        return this.ssoSetup(setupFunc)
    }

    private async ssoSetup(setupFunc: () => Promise<any>): Promise<AuthError | undefined> {
        try {
            await setupFunc()
            return
        } catch (e) {
            if (
                CancellationError.isUserCancelled(e) ||
                (e instanceof ToolkitError && CancellationError.isUserCancelled(e.cause))
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
                return { id: 'badStartUrl', text: `Failed, maybe verify your Start URL?` }
            }

            logger.error('Failed to setup.', e)
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

        await CodeWhispererAuth.instance.secondaryAuth.removeConnection()
        await signout(Auth.instance, activeConn) // deletes active connection
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
        // when triggered, and multiple events can fire at the same time so we throttle.
        const throttledFire = throttle(() => this.onDidConnectionUpdate.fire(undefined), 500)

        events.forEach(event =>
            event(() => {
                throttledFire()
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

    /** This represents the cause for the webview to open, wether a certain button was clicked or it opened automatically */
    #authSource?: AuthSource

    setSource(source: AuthSource | undefined) {
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
    private unlockedFeatures: ServiceItemId[] = []
    setUnlockedFeatures(unlocked: ServiceItemId[]) {
        this.unlockedFeatures = unlocked
    }
    getUnlockedFeatures() {
        return this.unlockedFeatures
    }

    /**
     * This keeps track of the current auth form fields that have invalid values.
     *
     * We use this to hold on to this information since we may need it at a later time.
     */
    private invalidFields: string[] | undefined
    setInvalidInputFields(fields: string[]) {
        this.invalidFields = fields
    }

    /**
     * These properties represent the last auth form that we interacted with.
     *
     * Eg: Builder ID for CodeWhisperer, Credentials for AWS Explorer
     */
    private previousAuthType: CredentialSourceId | undefined
    private previousFeatureType: AuthUiElement | undefined

    /**
     * This function is called whenever some sort of interaction with an auth form happens in
     * the webview. This helps keeps track of the auth form that was last interacted with.
     *
     * If a user starts interacting with a subsequent form this will emit a metric
     * related to an **unsuccessful** connection attempt to the previous auth form.
     */
    startAuthFormInteraction(featureType: AuthUiElement, authType: CredentialSourceId) {
        // Check if a previous auth interaction existed and that the new one is not the same as it
        if (
            this.previousFeatureType !== undefined &&
            this.previousAuthType !== undefined &&
            (this.previousFeatureType !== featureType || this.previousAuthType !== authType)
        ) {
            // At this point a user WAS previously interacting with a different auth form
            // and started interacting with a new one (hence the new feature + auth type).
            // We can now indicate that the previous one was cancelled and clear out any state values
            this.endExistingAuthFormInteraction(this.previousFeatureType, this.previousAuthType)
        }

        this.previousAuthType = authType
        this.previousFeatureType = featureType
    }

    /**
     * The metric for when an auth form that was unsuccessfully interacted with is
     * done being interacted with
     */
    private endExistingAuthFormInteraction(featureType: AuthUiElement, authType: CredentialSourceId, closed = false) {
        this.emitAuthAttempt({
            authType,
            featureType,
            result: 'Cancelled',
            invalidFields: this.invalidFields,
            reason: closed ? 'closedWindow' : 'switchedAuthForm',
        })

        this.invalidFields = undefined
    }

    /**
     * This is run when an auth form interaction was successful.
     *
     * We do this so subsequent auth form interaction checks don't
     * assume that this was cancelled, since we look back at the following
     * properties to see if an auth form was not successfully completed.
     */
    private successfulAuthFormInteraction() {
        this.previousAuthType = undefined
        this.previousFeatureType = undefined
    }

    /**
     * The metric when the webview is opened.
     *
     * Think of this as a snapshot of the state at the start.
     */
    async emitOpened() {
        telemetry.auth_addConnection.emit({
            source: this.getSource() ?? '',
            reason: 'opened',
            authConnectionsCount: await this.getConnectionCount(),
            authEnabledAreas: builderCommaDelimitedString(this.getUnlockedFeatures()),
        })
    }

    /**
     * The metric emitted when the webview is closed by the user.
     */
    async emitClosed() {
        if (this.previousFeatureType && this.previousAuthType) {
            // We are closing the webview, emit a final cancellation if they were
            // interacting with a form but failed to complete it.
            this.endExistingAuthFormInteraction(this.previousFeatureType, this.previousAuthType, true)
        }

        telemetry.auth_addConnection.emit({
            source: this.getSource() ?? '',
            reason: 'closed',
            authConnectionsCount: await this.getConnectionCount(),
            authEnabledAreas: builderCommaDelimitedString(this.getUnlockedFeatures()),
        })
        this.setSource(undefined)
    }

    /**
     * The metric when certain elements in the webview are clicked
     */
    emitUiClick(id: AuthUiClick) {
        telemetry.ui_click.emit({
            elementId: id,
        })
    }

    /**
     * This metric is emitted when an attempt to signin/connect/submit auth regardless
     * of success.
     *
     * Details:
     * - The inclusion of the fields 'credentialSourceId' + 'authUiElement' in this metric
     *   is the implicit indicator of what this metric resembles.
     * - The 'reason' field for failures will have the details as to why
     */
    async emitAuthAttempt(args: {
        authType: CredentialSourceId
        featureType: AuthUiElement
        result: Result
        reason?: string
        invalidFields?: string[]
    }) {
        telemetry.auth_addConnection.emit({
            source: this.#authSource ?? '',
            credentialSourceId: args.authType,
            authUiElement: args.featureType,
            result: args.result,
            authConnectionsCount: await this.getConnectionCount(),
            reason: args.reason,
            invalidInputFields: args.invalidFields ? builderCommaDelimitedString(args.invalidFields) : undefined,
        })

        if (args.result === 'Succeeded') {
            this.successfulAuthFormInteraction()
        }
    }
}

export type AuthUiClick =
    | 'auth_signUpForFree'
    | 'auth_infoIAMIdentityCenter'
    | 'auth_learnMoreAWSResources'
    | 'auth_learnMoreCodeWhisperer'
    | 'auth_learnMoreCodeCatalyst'
    | 'auth_explorer_expandIAMIdentityCenter'
    | 'auth_explorer_expandIAMCredentials'
    | 'auth_codewhisperer_expandIAMIdentityCenter'
    | 'auth_openAWSExplorer'
    | 'auth_openCodeWhisperer'
    | 'auth_openCodeCatalyst'
    | 'auth_editCredentials'
    | 'auth_codewhisperer_signoutBuilderId'
    | 'auth_codewhisperer_signoutIdentityCenter'
    | 'auth_codecatalyst_signoutBuilderId'
    | 'auth_explorer_signoutIdentityCenter'

// type AuthAreas = 'awsExplorer' | 'codewhisperer' | 'codecatalyst'

export function builderCommaDelimitedString(strings: string[]): string {
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
    if (executeFallbackLogic(serviceToShow) !== undefined) {
        // Fallback logic was executed
        return
    }

    let wasInitialServiceSet = false
    if (activePanel && serviceToShow) {
        // Webview is already open, so we have to select the service
        // through an event
        activePanel.server.onDidSelectService.fire(serviceToShow)
        wasInitialServiceSet = true
    }

    activePanel ??= new Panel(ctx, CodeCatalystAuthenticationProvider.fromContext(ctx))

    if (!wasInitialServiceSet && serviceToShow) {
        // Webview does not exist yet, preemptively set
        // the initial service to show
        activePanel.server.setInitialService(serviceToShow)
    }

    activePanel.server.setSource(source)
    activePanel.server.setupConnectionChangeEmitter()

    const webview = await activePanel!.show({
        title: `${getIdeProperties().company} Toolkit: Welcome & Getting Started`,
        viewColumn: isCloud9() ? vscode.ViewColumn.One : vscode.ViewColumn.Active,
        retainContextWhenHidden: true,
    })

    if (!subscriptions) {
        subscriptions = [
            webview.onDidDispose(() => {
                activePanel?.server.emitClosed()
                vscode.Disposable.from(...(subscriptions ?? [])).dispose()
                activePanel = undefined
                subscriptions = undefined
            }),
        ]
    }
}

/**
 * This function falls back to the previous non auth webview
 * logic if we are not in dev mode.
 *
 * TODO: Remove this dev mode check once our auth connections webview is fully implemented.
 * We are currently doing this to fallback to the previous behaviour while still being
 * able to pre-emptively update parts of the code to call the new functionality once
 * things are finalized.
 */
function executeFallbackLogic(serviceToShow?: ServiceItemId) {
    if (!DevSettings.instance.isDevMode()) {
        if (serviceToShow === 'codewhisperer') {
            return showSsoSignIn.execute()
        } else if (serviceToShow === 'codecatalyst') {
            return getStartedCommand.execute(CodeCatalystAuthenticationProvider.instance!)
        }
        return addConnection.execute()
    }
    return undefined
}
