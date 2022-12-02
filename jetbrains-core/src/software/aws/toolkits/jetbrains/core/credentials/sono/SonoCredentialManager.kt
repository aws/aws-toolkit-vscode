// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.loginSso
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenAuthState
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message

class SonoCredentialManager {
    private val project: Project?
    constructor(project: Project) {
        this.project = project
    }

    constructor() {
        this.project = null
    }

    internal fun provider() = (
        ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(CodeCatalystConnection.getInstance())
            as? AwsBearerTokenConnection
        )
        ?.getConnectionSettings()
        ?.tokenProvider?.delegate as? BearerTokenProvider

    fun getConnectionSettings(passiveOnly: Boolean = false): TokenConnectionSettings? {
        val provider = provider()
        if (provider == null) {
            if (passiveOnly) {
                return null
            }
            return getSettingsAndPromptAuth()
        }

        return when (provider.state()) {
            BearerTokenAuthState.NOT_AUTHENTICATED -> null
            BearerTokenAuthState.AUTHORIZED -> TokenConnectionSettings(ToolkitBearerTokenProvider(provider), SSO_REGION)
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

    fun getSettingsAndPromptAuth() = getProviderAndPromptAuth().asConnectionSettings()

    fun getProviderAndPromptAuth(): BearerTokenProvider {
        val provider = provider()
        return when (provider?.state()) {
            null -> runUnderProgressIfNeeded(null, message("credentials.sono.login.pending"), true) {
                loginSso(project, SONO_URL, ALL_SONO_SCOPES)
            }

            BearerTokenAuthState.NOT_AUTHENTICATED -> {
                runUnderProgressIfNeeded(null, message("credentials.sono.login.pending"), true) {
                    provider.reauthenticate()
                }

                return provider
            }

            BearerTokenAuthState.NEEDS_REFRESH -> {
                try {
                    runUnderProgressIfNeeded(null, message("credentials.sono.login.refreshing"), true) {
                        provider.resolveToken()
                        BearerTokenProviderListener.notifyCredUpdate(provider.id)
                    }
                } catch (e: SsoOidcException) {
                    LOG.warn(e) { "Redriving AWS Builder ID login flow since token could not be refreshed" }
                    runUnderProgressIfNeeded(null, message("credentials.sono.login.pending"), true) {
                        provider.reauthenticate()
                    }
                }

                return provider
            }

            BearerTokenAuthState.AUTHORIZED -> provider
        }
    }

    fun hasPreviouslyConnected() = provider()?.state()?.let { it != BearerTokenAuthState.NOT_AUTHENTICATED } ?: false

    private fun BearerTokenProvider.asConnectionSettings() = TokenConnectionSettings(ToolkitBearerTokenProvider(this), SSO_REGION)

    companion object {
        fun getInstance(project: Project? = null) = project?.let { it.service<SonoCredentialManager>() } ?: service()

        fun loginSono(project: Project?) {
            val provider = SonoCredentialManager.getInstance(project).getProviderAndPromptAuth()
            val connection = ToolkitAuthManager.getInstance().getConnection(provider.id) ?: error("Mismatch between provider id and connection id")
            ToolkitConnectionManager.getInstance(project).switchConnection(connection)
        }

        private val LOG = getLogger<SonoCredentialManager>()

        private val SSO_REGION by lazy {
            with(AwsRegionProvider.getInstance()) {
                get(SONO_REGION) ?: throw RuntimeException("AwsRegionProvider was unable to provide SSO_REGION for AWS Builder ID")
            }
        }
    }
}

fun lazilyGetUserId() = tryOrNull {
    SonoCredentialManager.getInstance().getConnectionSettings(passiveOnly = true)?.let {
        AwsResourceCache.getInstance().getResourceNow(CawsResources.ID, it)
    }
} ?: DefaultMetricEvent.METADATA_NA
