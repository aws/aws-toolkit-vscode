// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.DefaultConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.core.gettingstarted.SourceOfEntry
import software.aws.toolkits.jetbrains.core.gettingstarted.authAndUpdateConfig
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getConnectionCount
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getEnabledConnections
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getSourceOfEntry
import software.aws.toolkits.telemetry.AuthTelemetry
import software.aws.toolkits.telemetry.CredentialSourceId
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result

sealed class Login {
    abstract val id: CredentialSourceId

    data class BuilderId(val scopes: List<String>, val onPendingToken: () -> Unit) : Login() {
        override val id: CredentialSourceId = CredentialSourceId.AwsId

        fun loginBuilderId(project: Project): Boolean {
            onPendingToken()

            loginSso(project, SONO_URL, SONO_REGION, scopes)
            return true
        }
    }

    data class IdC(
        val profileName: String,
        val startUrl: String,
        val region: AwsRegion,
        val scopes: List<String>,
        val onPendingToken: (InteractiveBearerTokenProvider) -> Unit
    ) : Login() {
        override val id: CredentialSourceId = CredentialSourceId.IamIdentityCenter
        private val configFilesFacade = DefaultConfigFilesFacade()

        fun loginIdc(project: Project): Boolean {
            // we have this check here so we blow up early if user has an invalid config file
            try {
                configFilesFacade.readSsoSessions()
            } catch (e: Exception) {
                println("Failed to read sso sessions file")
                return false
            }

            val profile = UserConfigSsoSessionProfile(
                configSessionName = profileName,
                ssoRegion = region.id,
                startUrl = startUrl,
                scopes = scopes
            )

            authAndUpdateConfig(project, profile, configFilesFacade, onPendingToken) {
                Messages.showErrorDialog(project, it, "Login Failed")
                AuthTelemetry.addConnection(
                    project,
                    source = "", // TODO: fix it
                    featureId = FeatureId.Q,
                    credentialSourceId = CredentialSourceId.IamIdentityCenter,
                    isAggregated = false,
                    attempts = 0, // TODO: fix it
                    result = Result.Failed,
                    reason = "ConnectionUnsuccessful"
                )
            } ?: return false

            return true
        }
    }
}

fun requestCredentialsForQ(
    project: Project,
    login: Login,
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

    val isAuthenticationSuccessful = when (login) {
        is Login.BuilderId -> {
            login.loginBuilderId(project)
        }

        is Login.IdC -> {
            login.loginIdc(project)
        }
    }

    if (isAuthenticationSuccessful) {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.Q, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            featureId = FeatureId.Q,
            credentialSourceId = login.id,
            isAggregated = true,
            attempts = 0, // TODO: fix it
            result = Result.Succeeded
        )
        AuthTelemetry.addedConnections(
            project,
            source = getSourceOfEntry(SourceOfEntry.Q, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            authConnectionsCount = initialConnectionCount,
            newAuthConnectionsCount = getConnectionCount() - initialConnectionCount,
            enabledAuthConnections = initialAuthConnections,
            newEnabledAuthConnections = getEnabledConnections(project),
            attempts = 0, // TODO: fix it
            result = Result.Succeeded
        )
    } else {
        AuthTelemetry.addConnection(
            project,
            source = getSourceOfEntry(SourceOfEntry.Q, isFirstInstance, connectionInitiatedFromExplorer, connectionInitiatedFromQChatPanel),
            featureId = FeatureId.Q,
            credentialSourceId = login.id,
            isAggregated = false,
            attempts = 0, // TODO: fix it
            result = Result.Cancelled,
        )
    }
    return isAuthenticationSuccessful
}
