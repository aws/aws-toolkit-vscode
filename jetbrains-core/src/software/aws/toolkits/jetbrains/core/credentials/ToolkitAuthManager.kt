// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.ALL_SONO_SCOPES
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.DEFAULT_SSO_REGION
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message

sealed interface ToolkitConnection {
    val id: String
    val label: String

    fun getConnectionSettings(): ClientConnectionSettings<*>
}

interface AwsCredentialConnection : ToolkitConnection {
    override fun getConnectionSettings(): ConnectionSettings
}

interface AwsBearerTokenConnection : ToolkitConnection {
    override fun getConnectionSettings(): TokenConnectionSettings
}

interface BearerSsoConnection : AwsBearerTokenConnection {
    val scopes: List<String>
}

sealed interface AuthProfile

data class ManagedSsoProfile(
    var ssoRegion: String = "",
    var startUrl: String = "",
    var scopes: List<String> = emptyList()
) : AuthProfile

data class DiskSsoSessionProfile(
    var profileName: String = "",
    var ssoRegion: String = ""
) : AuthProfile

/**
 * Used to contribute connections to [ToolkitAuthManager] on service initialization
 */
interface ToolkitStartupAuthFactory {
    fun buildConnections(): List<ToolkitConnection>

    companion object {
        val EP_NAME = ExtensionPointName.create<ToolkitStartupAuthFactory>("aws.toolkit.startupAuthFactory")
    }
}

interface ToolkitAuthManager {
    fun listConnections(): List<ToolkitConnection>

    fun createConnection(profile: AuthProfile): ToolkitConnection

    fun deleteConnection(connection: ToolkitConnection)
    fun deleteConnection(connectionId: String)

    fun getConnection(connectionId: String): ToolkitConnection?

    companion object {
        fun getInstance() = service<ToolkitAuthManager>()
    }
}

interface ToolkitConnectionManager {
    fun activeConnection(): ToolkitConnection?

    fun activeConnectionForFeature(feature: FeatureWithPinnedConnection): ToolkitConnection?

    fun switchConnection(connection: ToolkitConnection?)

    companion object {
        fun getInstance(project: Project?) = project?.let { it.service<ToolkitConnectionManager>() } ?: service()
    }
}

/**
 * Individual service should subscribe [ToolkitConnectionManagerListener.TOPIC] to fire their service activation / UX update
 */
fun loginSso(project: Project?, startUrl: String, scopes: List<String> = ALL_SONO_SCOPES): BearerTokenProvider {
    val connectionId = ToolkitBearerTokenProvider.ssoIdentifier(startUrl)
    val manager = ToolkitAuthManager.getInstance()

    return manager.getConnection(connectionId)?.let { connection ->
        // There is an existing connection we can use
        if (connection is BearerSsoConnection && !scopes.all { it in connection.scopes }) {
            getLogger<ToolkitAuthManager>().info {
                "Forcing reauth on ${connection.id} since requested scopes ($scopes) are not a complete subset of current scopes (${connection.scopes})"
            }
            // can't reuse since requested scopes are not in current connection. forcing reauth
            manager.deleteConnection(connection)
            return@let null
        }

        // For the case when the existing connection is in invalid state, we need to re-auth
        if (connection is AwsBearerTokenConnection) {
            val tokenProvider = reauthProviderIfNeeded(connection)

            ToolkitConnectionManager.getInstance(project).switchConnection(connection)

            return tokenProvider
        }

        null
    } ?: run {
        // No existing connection, start from scratch
        val connection = manager.createConnection(
            ManagedSsoProfile(
                DEFAULT_SSO_REGION,
                startUrl,
                scopes
            )
        )

        try {
            val provider = reauthProviderIfNeeded(connection)

            ToolkitConnectionManager.getInstance(project).switchConnection(connection)

            provider
        } catch (e: Exception) {
            manager.deleteConnection(connection)
            throw e
        }
    }
}

private fun reauthProviderIfNeeded(connection: ToolkitConnection): BearerTokenProvider {
    val tokenProvider = (connection.getConnectionSettings() as TokenConnectionSettings).tokenProvider.delegate as BearerTokenProvider
    val state = tokenProvider.state()
    runUnderProgressIfNeeded(null, message("settings.states.validating.short"), false) {
        if (state == BearerTokenAuthState.NEEDS_REFRESH) {
            try {
                tokenProvider.resolveToken()
                BearerTokenProviderListener.notifyCredUpdate(tokenProvider.id)
            } catch (e: SsoOidcException) {
                tokenProvider.reauthenticate()
            }
        } else if (state == BearerTokenAuthState.NOT_AUTHENTICATED) {
            tokenProvider.reauthenticate()
        }

        Unit
    }

    return tokenProvider
}
