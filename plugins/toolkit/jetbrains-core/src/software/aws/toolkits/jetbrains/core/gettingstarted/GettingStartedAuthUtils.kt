// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.ui.jcef.JBCefApp
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.DefaultConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ProfileSsoManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.authAndUpdateConfig
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.sono.CODECATALYST_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.explorer.showWebview
import software.aws.toolkits.jetbrains.core.explorer.webview.ToolkitWebviewPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getAuthStatus
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getConnectionCount
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getEnabledConnections
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getSourceOfEntry
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getStartupState
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.services.caws.CawsEndpoints.CAWS_DOCS
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AuthTelemetry
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result

fun rolePopupFromConnection(
    project: Project,
    connection: AwsBearerTokenConnection,
    configFilesFacade: ConfigFilesFacade = DefaultConfigFilesFacade(),
    isFirstInstance: Boolean = false
) {
    runInEdt {
        if (!connection.id.startsWith(SsoSessionConstants.SSO_SESSION_SECTION_NAME)) {
            // require reauth if it's not a profile-based sso connection
            requestCredentialsForExplorer(project, isFirstInstance = isFirstInstance, connectionInitiatedFromExplorer = true)
        } else {
            val session = connection.id.substringAfter("${SsoSessionConstants.SSO_SESSION_SECTION_NAME}:")

            val tokenProvider = if (!connection.scopes.contains(IDENTITY_CENTER_ROLE_ACCESS_SCOPE)) {
                val scopes = connection.scopes + IDENTITY_CENTER_ROLE_ACCESS_SCOPE
                val profile = UserConfigSsoSessionProfile(
                    configSessionName = session,
                    ssoRegion = connection.region,
                    startUrl = connection.startUrl,
                    scopes = scopes
                )

                authAndUpdateConfig(project, profile, configFilesFacade, {}) { e, _ ->
                    Messages.showErrorDialog(project, e.message, message("gettingstarted.explorer.iam.add"))
                } ?: return@runInEdt
            } else {
                reauthConnectionIfNeeded(project, connection)
                connection
            }.getConnectionSettings().tokenProvider

            IdcRolePopup(project, connection.region, session, tokenProvider).show()
        }
    }
}

fun requestCredentialsForCodeWhisperer(
    project: Project,
    popupBuilderIdTab: Boolean = true,
    initialConnectionCount: Int = getConnectionCount(),
    initialAuthConnections: String = getEnabledConnections(
        project
    ),
    isFirstInstance: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false
): Boolean {
    val authenticationDialog = SetupAuthenticationDialog(
        project,
        state = SetupAuthenticationDialogState().also {
            if (popupBuilderIdTab) {
                it.selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
            }
        },
        tabSettings = mapOf(
            SetupAuthenticationTabs.IDENTITY_CENTER to AuthenticationTabSettings(
                disabled = false,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.WARNING,
                    message("gettingstarted.setup.codewhisperer.use_builder_id"),
                    CODEWHISPERER_AUTH_LEARN_MORE_LINK
                )
            ),
            SetupAuthenticationTabs.BUILDER_ID to AuthenticationTabSettings(
                disabled = false,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.WARNING,
                    message("gettingstarted.setup.codewhisperer.use_identity_center"),
                    CODEWHISPERER_AUTH_LEARN_MORE_LINK
                )
            ),
            SetupAuthenticationTabs.IAM_LONG_LIVED to AuthenticationTabSettings(
                disabled = true,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.ERROR,
                    message("gettingstarted.setup.auth.no_iam"),
                    CODEWHISPERER_AUTH_LEARN_MORE_LINK

                )
            )
        ),
        scopes = Q_SCOPES,
        promptForIdcPermissionSet = false,
        sourceOfEntry = SourceOfEntry.CODEWHISPERER,
        featureId = FeatureId.Codewhisperer,
        isFirstInstance = isFirstInstance,
        connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
    )
    val isAuthenticationSuccessful = authenticationDialog.showAndGet()
    if (isAuthenticationSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODEWHISPERER, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.Codewhisperer,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = true,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODEWHISPERER, isFirstInstance, connectionInitiatedFromExplorer),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODEWHISPERER, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.Codewhisperer,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = false,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Cancelled,
        )
    }
    return isAuthenticationSuccessful
}

@Deprecated("pending moving to Q package")
fun requestCredentialsForQ(
    project: Project,
    initialConnectionCount: Int = getConnectionCount(),
    initialAuthConnections: String = getEnabledConnections(
        project
    ),
    isFirstInstance: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false,
    connectionInitiatedFromQChatPanel: Boolean = false
): Boolean {
    // try to scope upgrade if we have a codewhisperer connection
    val codeWhispererConnection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeWhispererConnection.getInstance())
    if (codeWhispererConnection is LegacyManagedBearerSsoConnection) {
        codeWhispererConnection.let {
            return tryOrNull {
                loginSso(project, it.startUrl, it.region, Q_SCOPES)
            } != null
        }
    }

    val dialogState = SetupAuthenticationDialogState().apply {
        (codeWhispererConnection as? ProfileSsoManagedBearerSsoConnection)?.let { connection ->
            idcTabState.apply {
                profileName = connection.configSessionName
                startUrl = connection.startUrl
                region = AwsRegionProvider.getInstance().let { it.get(connection.region) ?: it.defaultRegion() }
            }

            // default selected tab is IdC, but just in case
            selectedTab.set(SetupAuthenticationTabs.IDENTITY_CENTER)
        } ?: run {
            selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
        }
    }

    val authenticationDialog = SetupAuthenticationDialog(
        project,
        state = dialogState,
        tabSettings = mapOf(
            SetupAuthenticationTabs.IDENTITY_CENTER to AuthenticationTabSettings(
                disabled = false,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.WARNING,
                    message("gettingstarted.setup.codewhisperer.use_builder_id"),
                    CODEWHISPERER_AUTH_LEARN_MORE_LINK
                )
            ),
            SetupAuthenticationTabs.BUILDER_ID to AuthenticationTabSettings(
                disabled = false,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.WARNING,
                    message("gettingstarted.setup.codewhisperer.use_identity_center"),
                    CODEWHISPERER_AUTH_LEARN_MORE_LINK
                )
            ),
            SetupAuthenticationTabs.IAM_LONG_LIVED to AuthenticationTabSettings(
                disabled = true,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.ERROR,
                    message("gettingstarted.setup.auth.no_iam"),
                    CODEWHISPERER_AUTH_LEARN_MORE_LINK
                )
            )
        ),
        scopes = Q_SCOPES,
        promptForIdcPermissionSet = false,
        sourceOfEntry = SourceOfEntry.Q,
        featureId = FeatureId.Q, // TODO: Update Q  in common
        connectionInitiatedFromQChatPanel = connectionInitiatedFromQChatPanel
    )

    val isAuthenticationSuccessful = authenticationDialog.showAndGet()
    if (isAuthenticationSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.Q, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            featureId = FeatureId.Q,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = true,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.Q, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.Q, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            featureId = FeatureId.Q,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = false,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Cancelled,
        )
    }
    return isAuthenticationSuccessful
}

fun requestCredentialsForCodeCatalyst(
    project: Project?,
    popupBuilderIdTab: Boolean = true,
    initialConnectionCount: Int = getConnectionCount(),
    initialAuthConnections: String = getEnabledConnections(
        project
    ),
    isFirstInstance: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false
): Boolean? {
    if (JBCefApp.isSupported() && project != null) {
        ToolkitWebviewPanel.getInstance(project).browser?.prepareBrowser(BrowserState(FeatureId.Codecatalyst, true)) // TODO: consume data
        showWebview(project)

        return null
    }

    val authenticationDialog = when (ApplicationInfo.getInstance().build.productCode) {
        "GW" -> {
            GatewaySetupAuthenticationDialog(
                project,
                state = GatewaySetupAuthenticationDialogState().also {
                    it.selectedTab.set(GatewaySetupAuthenticationTabs.BUILDER_ID)
                },
                tabSettings = emptyMap(),
                scopes = CODECATALYST_SCOPES,
                promptForIdcPermissionSet = false
            )
        }

        else -> {
            SetupAuthenticationDialog(
                project,
                state = SetupAuthenticationDialogState().also {
                    if (popupBuilderIdTab) {
                        it.selectedTab.set(SetupAuthenticationTabs.BUILDER_ID)
                    }
                },
                tabSettings = mapOf(
                    SetupAuthenticationTabs.IAM_LONG_LIVED to AuthenticationTabSettings(
                        disabled = true,
                        notice = SetupAuthenticationNotice(
                            SetupAuthenticationNotice.NoticeType.ERROR,
                            message("gettingstarted.setup.codecatalyst.no_iam"),
                            CAWS_DOCS
                        )
                    )
                ),
                scopes = CODECATALYST_SCOPES,
                promptForIdcPermissionSet = false,
                sourceOfEntry = SourceOfEntry.CODECATALYST,
                featureId = FeatureId.Codecatalyst,
                isFirstInstance = isFirstInstance,
                connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
            )
        }
    }

    val isAuthenticationSuccessful = authenticationDialog.showAndGet()
    if (isAuthenticationSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODECATALYST, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.Codecatalyst,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = true,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODECATALYST, isFirstInstance, connectionInitiatedFromExplorer),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.CODECATALYST, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.Codecatalyst,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = false,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Cancelled,
        )
    }
    return isAuthenticationSuccessful
}

fun reauthenticateWithQ(project: Project) {
    val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
    if (connection !is ManagedBearerSsoConnection) return
    ApplicationManager.getApplication().executeOnPooledThread {
        reauthConnectionIfNeeded(project, connection)
    }
}

fun requestCredentialsForExplorer(
    project: Project,
    initialConnectionCount: Int = getConnectionCount(),
    initialAuthConnections: String = getEnabledConnections(
        project
    ),
    isFirstInstance: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false
): Boolean? {
    if (JBCefApp.isSupported()) {
        ToolkitWebviewPanel.getInstance(project).browser?.prepareBrowser(BrowserState(FeatureId.AwsExplorer, true)) // TODO: consume data
        showWebview(project)
        return null
    }

    val authenticationDialog = SetupAuthenticationDialog(
        project,
        tabSettings = mapOf(
            SetupAuthenticationTabs.BUILDER_ID to AuthenticationTabSettings(
                disabled = true,
                notice = SetupAuthenticationNotice(
                    SetupAuthenticationNotice.NoticeType.ERROR,
                    message("gettingstarted.setup.explorer.no_builder_id"),
                    "https://docs.aws.amazon.com/signin/latest/userguide/differences-aws_builder_id.html"
                )
            )
        ),
        promptForIdcPermissionSet = true,
        sourceOfEntry = SourceOfEntry.RESOURCE_EXPLORER,
        featureId = FeatureId.AwsExplorer,
        isFirstInstance = isFirstInstance,
        connectionInitiatedFromExplorer = connectionInitiatedFromExplorer
    )
    val isAuthSuccessful = authenticationDialog.showAndGet()
    if (isAuthSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.RESOURCE_EXPLORER, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.AwsExplorer,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = true,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.RESOURCE_EXPLORER, isFirstInstance, connectionInitiatedFromExplorer),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = authenticationDialog.attempts + 1,
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.RESOURCE_EXPLORER, isFirstInstance, connectionInitiatedFromExplorer),
            featureId = FeatureId.AwsExplorer,
            credentialSourceId = authenticationDialog.authType,
            isAggregated = false,
            attempts = authenticationDialog.attempts + 1,
            result = Result.Cancelled,
        )
    }
    return isAuthSuccessful
}

fun emitUserState(project: Project) {
    AuthTelemetry.userState(
        project,
        source = getStartupState().toString(),
        authEnabledConnections = getEnabledConnections(project),
        authStatus = getAuthStatus(project),
        passive = true
    )
}

const val CODEWHISPERER_AUTH_LEARN_MORE_LINK = "https://docs.aws.amazon.com/codewhisperer/latest/userguide/codewhisperer-auth.html"

fun shouldShowNonWebviewUI(): Boolean = !JBCefApp.isSupported()
