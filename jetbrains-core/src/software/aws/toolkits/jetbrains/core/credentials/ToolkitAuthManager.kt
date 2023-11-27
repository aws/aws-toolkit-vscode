// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.MessageDialogBuilder
import org.jetbrains.annotations.VisibleForTesting
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.SSO_SESSION_SECTION_NAME
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.utils.computeOnEdt
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
    val startUrl: String
    val region: String

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

data class UserConfigSsoSessionProfile(
    var configSessionName: String = "",
    var ssoRegion: String = "",
    var startUrl: String = "",
    var scopes: List<String> = emptyList()
) : AuthProfile {
    val id
        get() = "$SSO_SESSION_SECTION_NAME:$configSessionName"
}

data class DetectedDiskSsoSessionProfile(
    var profileName: String = "",
    var startUrl: String = "",
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

    /**
     * Creates a connection that is not visible to the rest of the toolkit unless authentication succeeds
     * @return [BearerSsoConnection] on success
     */
    fun tryCreateTransientSsoConnection(profile: AuthProfile, callback: (BearerSsoConnection) -> Unit): BearerSsoConnection
    fun getOrCreateSsoConnection(profile: UserConfigSsoSessionProfile): BearerSsoConnection

    fun deleteConnection(connection: ToolkitConnection)
    fun deleteConnection(connectionId: String)

    fun getConnection(connectionId: String): ToolkitConnection?

    companion object {
        fun getInstance() = service<ToolkitAuthManager>()
    }
}

interface ToolkitConnectionManager : Disposable {
    fun activeConnection(): ToolkitConnection?

    fun activeConnectionForFeature(feature: FeatureWithPinnedConnection): ToolkitConnection?

    fun switchConnection(newConnection: ToolkitConnection?)

    override fun dispose() {}

    companion object {
        fun getInstance(project: Project?) = project?.let { it.service<ToolkitConnectionManager>() } ?: service()
    }
}

/**
 * Individual service should subscribe [ToolkitConnectionManagerListener.TOPIC] to fire their service activation / UX update
 */
@Deprecated("Connections created through this function are not written to the user's ~/.aws/config file")
fun loginSso(project: Project?, startUrl: String, region: String, requestedScopes: List<String>): BearerTokenProvider {
    val connectionId = ToolkitBearerTokenProvider.ssoIdentifier(startUrl, region)

    val manager = ToolkitAuthManager.getInstance()
    val allScopes = requestedScopes.toMutableSet()
    return manager.getConnection(connectionId)?.let { connection ->
        val logger = getLogger<ToolkitAuthManager>()
        // requested Builder ID, but one already exists
        // TBD: do we do this for regular SSO too?
        if (connection.isSono() && connection is BearerSsoConnection && requestedScopes.all { it in connection.scopes }) {
            val signOut = computeOnEdt {
                MessageDialogBuilder.yesNo(
                    message("toolkit.login.aws_builder_id.already_connected.title"),
                    message("toolkit.login.aws_builder_id.already_connected.message")
                )
                    .yesText(message("toolkit.login.aws_builder_id.already_connected.reconnect"))
                    .noText(message("toolkit.login.aws_builder_id.already_connected.cancel"))
                    .ask(project)
            }

            if (signOut) {
                logger.info {
                    "Forcing reauth on ${connection.id} since user requested Builder ID while already connected to Builder ID"
                }

                logoutFromSsoConnection(project, connection as AwsBearerTokenConnection)
                return@let null
            }
        }

        // There is an existing connection we can use
        if (connection is BearerSsoConnection && !requestedScopes.all { it in connection.scopes }) {
            allScopes.addAll(connection.scopes)

            logger.info {
                """
                    Forcing reauth on ${connection.id} since requested scopes ($requestedScopes)
                    are not a complete subset of current scopes (${connection.scopes})
                """.trimIndent()
            }
            logoutFromSsoConnection(project, connection as AwsBearerTokenConnection)
            // can't reuse since requested scopes are not in current connection. forcing reauth
            return@let null
        }

        // For the case when the existing connection is in invalid state, we need to re-auth
        if (connection is AwsBearerTokenConnection) {
            return reauthConnection(project, connection)
        }

        null
    } ?: run {
        // No existing connection, start from scratch
        val connection = manager.createConnection(
            ManagedSsoProfile(
                region,
                startUrl,
                allScopes.toList()
            )
        )

        try {
            reauthConnection(project, connection)
        } catch (e: Exception) {
            manager.deleteConnection(connection)
            throw e
        }
    }
}

@VisibleForTesting
internal fun reauthConnection(project: Project?, connection: ToolkitConnection): BearerTokenProvider {
    val provider = reauthConnectionIfNeeded(project, connection)

    ToolkitConnectionManager.getInstance(project).switchConnection(connection)

    return provider
}

fun logoutFromSsoConnection(project: Project?, connection: AwsBearerTokenConnection, callback: () -> Unit = {}) {
    try {
        ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC).invalidate(connection.id)
        ToolkitAuthManager.getInstance().deleteConnection(connection.id)
        project?.let { ToolkitConnectionManager.getInstance(it).switchConnection(null) }
    } finally {
        callback()
    }
}

fun lazyGetUnauthedBearerConnections() =
    ToolkitAuthManager.getInstance().listConnections().filterIsInstance<AwsBearerTokenConnection>().filter {
        it.lazyIsUnauthedBearerConnection()
    }

fun AwsBearerTokenConnection.lazyIsUnauthedBearerConnection(): Boolean {
    val provider = (getConnectionSettings().tokenProvider.delegate as? BearerTokenProvider)

    if (provider != null) {
        if (provider.currentToken() == null) {
            // provider is unauthed if no token
            return true
        }

        // or token can't be used directly without interaction
        return provider.state() != BearerTokenAuthState.AUTHORIZED
    }

    // not a bearer token provider
    return false
}

fun reauthConnectionIfNeeded(project: Project?, connection: ToolkitConnection): BearerTokenProvider {
    val tokenProvider = (connection.getConnectionSettings() as TokenConnectionSettings).tokenProvider.delegate as BearerTokenProvider

    return reauthProviderIfNeeded(project, tokenProvider, connection.isSono())
}

fun reauthProviderIfNeeded(project: Project?, tokenProvider: BearerTokenProvider, isBuilderId: Boolean): BearerTokenProvider {
    maybeReauthProviderIfNeeded(project, tokenProvider, isBuilderId) {
        val title = if (isBuilderId) {
            message("credentials.sono.login.pending")
        } else {
            message("credentials.sso.login.pending")
        }

        runUnderProgressIfNeeded(project, title, true) {
            tokenProvider.reauthenticate()
        }
    }

    return tokenProvider
}

// Return true if need to re-auth, false otherwise
fun maybeReauthProviderIfNeeded(
    project: Project?,
    tokenProvider: BearerTokenProvider,
    isBuilderId: Boolean,
    onReauthRequired: (SsoOidcException?) -> Any
): Boolean {
    val state = tokenProvider.state()
    when (state) {
        BearerTokenAuthState.NOT_AUTHENTICATED -> {
            getLogger<ToolkitAuthManager>().info { "Token provider NOT_AUTHENTICATED, requesting login" }
            onReauthRequired(null)
            return true
        }

        BearerTokenAuthState.NEEDS_REFRESH -> {
            try {
                val title = if (isBuilderId) {
                    message("credentials.sono.login.refreshing")
                } else {
                    message("credentials.sso.login.refreshing")
                }

                return runUnderProgressIfNeeded(project, title, true) {
                    tokenProvider.resolveToken()
                    BearerTokenProviderListener.notifyCredUpdate(tokenProvider.id)
                    return@runUnderProgressIfNeeded false
                }
            } catch (e: SsoOidcException) {
                getLogger<ToolkitAuthManager>().warn(e) { "Redriving bearer token login flow since token could not be refreshed" }
                onReauthRequired(e)
                return true
            }
        }

        BearerTokenAuthState.AUTHORIZED -> { return false }
    }
}
