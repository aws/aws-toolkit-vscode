// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.dsl.builder.panel
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.logoutFromSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.maybeReauthProviderIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForCodeCatalyst
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class CodeCatalystCredentialManager {
    private val project: Project?
    constructor(project: Project) {
        this.project = project
    }

    constructor() {
        this.project = null
    }

    fun connection() = (
        ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeCatalystConnection.getInstance())
            as? AwsBearerTokenConnection
        )

    internal fun provider(conn: AwsBearerTokenConnection) = conn.getConnectionSettings().tokenProvider.delegate as BearerTokenProvider

    fun getConnectionSettings(passiveOnly: Boolean = false): TokenConnectionSettings? {
        val connection = connection()
        if (connection == null) {
            if (passiveOnly) {
                return null
            }
            return getSettingsAndPromptAuth()
        }

        val provider = provider(connection)
        return when (provider.state()) {
            BearerTokenAuthState.NOT_AUTHENTICATED -> null
            BearerTokenAuthState.AUTHORIZED -> connection.getConnectionSettings()
            else -> {
                if (passiveOnly) {
                    null
                } else {
                    tryOrNull {
                        getSettingsAndPromptAuth()
                    }
                }
            }
        }
    }

    fun getSettingsAndPromptAuth(): TokenConnectionSettings {
        promptAuth()
        val connection = connection() ?: error("Expected connection not to be null")
        return connection.getConnectionSettings()
    }

    fun promptAuth(): BearerTokenProvider? {
        connection()?.let {
            val tokenProvider = provider(it)
            val reauthRequired = maybeReauthProviderIfNeeded(project, tokenProvider) {}
            if (reauthRequired) {
                val useCurrentCredentials =
                    computeOnEdt {
                        val accountType = if (it.startUrl == SONO_URL) message("aws_builder_id.service_name") else message("iam_identity_center.name")
                        SignInWithTheCurrentCredentials(project, accountType).showAndGet()
                    }
                if (useCurrentCredentials) {
                    runUnderProgressIfNeeded(project, message("credentials.pending.title"), true) {
                        tokenProvider.reauthenticate()
                    }
                    return tokenProvider
                } else {
                    return newCredentialRequest()
                }
            } else {
                return tokenProvider
            }
        }

        return newCredentialRequest()
    }

    private fun newCredentialRequest() = runUnderProgressIfNeeded(project, message("credentials.pending.title"), true) {
        val closed = computeOnEdt {
            requestCredentialsForCodeCatalyst(project)
        }

        if (closed == null) {
            return@runUnderProgressIfNeeded null
        }

        if (closed) {
            connection()?.let {
                return@runUnderProgressIfNeeded provider(it)
            }
            error("Unable to request credentials for CodeCatalyst")
        }
        return@runUnderProgressIfNeeded null
    }

    fun closeConnection() {
        connection()?.let { logoutFromSsoConnection(project, it) }
    }

    fun isConnected(): Boolean = connection()?.let { provider(it).state() != BearerTokenAuthState.NOT_AUTHENTICATED } ?: false

    inner class SignInWithTheCurrentCredentials(project: Project?, private val accountType: String) : DialogWrapper(project) {

        init {
            init()
            title = message("general.auth.reauthenticate")
            setCancelButtonText(message("gateway.auth.different.account.sign.in"))
        }
        override fun createCenterPanel(): JComponent = panel {
            row {
                label(message("gateway.auth.different.account.already.signed.in", accountType))
            }
        }
    }

    companion object {
        fun getInstance(project: Project? = null) = project?.let { it.service<CodeCatalystCredentialManager>() } ?: service()
    }
}

fun lazilyGetUserId() = tryOrNull {
    CodeCatalystCredentialManager.getInstance().getConnectionSettings(passiveOnly = true)?.let {
        AwsResourceCache.getInstance().getResourceNow(CawsResources.ID, it)
    }
} ?: DefaultMetricEvent.METADATA_NA
