// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.profiles.internal.ProfileFileReader
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssooidc.model.InvalidGrantException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.credentials.validatedSsoIdentifierFromUrl
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.AwsCoreBundle
import software.aws.toolkits.telemetry.CredentialSourceId
import java.io.IOException

sealed class Login<T> {
    abstract val id: CredentialSourceId
    abstract val onError: (Exception) -> Unit
    protected abstract fun doLogin(project: Project): T

    fun login(project: Project): T {
        try {
            return doLogin(project)
        } catch (e: Exception) {
            onError(e)
            throw e
        }
    }

    data class BuilderId(
        val scopes: List<String>,
        val onPendingToken: (InteractiveBearerTokenProvider) -> Unit,
        override val onError: (Exception) -> Unit,
        val onSuccess: () -> Unit
    ) : Login<Unit>() {
        override val id: CredentialSourceId = CredentialSourceId.AwsId

        override fun doLogin(project: Project) {
            loginSso(project, SONO_URL, SONO_REGION, scopes, onPendingToken, onError, onSuccess) != null
        }
    }

    data class IdC(
        val startUrl: String,
        val region: AwsRegion,
        val scopes: List<String>,
        val onPendingToken: (InteractiveBearerTokenProvider) -> Unit,
        val onSuccess: () -> Unit,
        override val onError: (Exception) -> Unit
    ) : Login<AwsBearerTokenConnection?>() {
        override val id: CredentialSourceId = CredentialSourceId.IamIdentityCenter
        private val configFilesFacade = DefaultConfigFilesFacade()

        override fun doLogin(project: Project): AwsBearerTokenConnection? {
            // we have this check here so we blow up early if user has an invalid config file
            try {
                configFilesFacade.readSsoSessions()
            } catch (e: Exception) {
                onError(ConfigFacadeException(e))
                return null
            }

            val profile = UserConfigSsoSessionProfile(
                configSessionName = validatedSsoIdentifierFromUrl(startUrl),
                ssoRegion = region.id,
                startUrl = startUrl,
                scopes = scopes
            )

            // expect 'authAndUpdateConfig' to call onError on failure
            val conn = authAndUpdateConfig(project, profile, configFilesFacade, onPendingToken, onSuccess, onError) ?: return null

            // TODO: delta, make sure we are good to switch immediately
//            if (!promptForIdcPermissionSet) {
//                ToolkitConnectionManager.getInstance(project).switchConnection(connection)
//                close(DialogWrapper.OK_EXIT_CODE)
//                return
//            }
            ToolkitConnectionManager.getInstance(project).switchConnection(conn)

            return conn
        }
    }

    data class LongLivedIAM(
        val profileName: String,
        val accessKey: String,
        val secretKey: String,
        val onConfigFileFacadeError: (Exception) -> Unit,
        val onProfileAlreadyExist: () -> Unit,
        val onConnectionValidationError: (Exception) -> Unit
    ) : Login<Boolean>() {
        override val onError: (Exception) -> Unit = {}

        override val id: CredentialSourceId = CredentialSourceId.SharedCredentials
        private val configFilesFacade = DefaultConfigFilesFacade()

        override fun doLogin(project: Project): Boolean {
            val existingProfiles = try {
                configFilesFacade.readAllProfiles()
            } catch (e: Exception) {
                onConfigFileFacadeError(ConfigFacadeException(e))
                return false
            }

            if (existingProfiles.containsKey(profileName)) {
                onProfileAlreadyExist()
                return false
            }

            try {
                runUnderProgressIfNeeded(project, AwsCoreBundle.message("settings.states.validating.short"), cancelable = true) {
                    AwsClientManager.getInstance().createUnmanagedClient<StsClient>(
                        StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)),
                        Region.AWS_GLOBAL
                    ).use { client ->
                        client.getCallerIdentity()
                    }
                }
            } catch (e: Exception) {
                onConnectionValidationError(e)
                return false
            }

            val profile = Profile.builder()
                .name(profileName)
                .properties(
                    mapOf(
                        "aws_access_key_id" to accessKey,
                        "aws_secret_access_key" to secretKey
                    )
                )
                .build()

            configFilesFacade.appendProfileToCredentials(profile)

            // TODO: how to refresh partially?
            // TODO: should it live in configFileFacade
            VirtualFileManager.getInstance().refreshWithoutFileWatcher(false)

            return true
        }
    }
}

fun authAndUpdateConfig(
    project: Project?,
    profile: UserConfigSsoSessionProfile,
    configFilesFacade: ConfigFilesFacade,
    onPendingToken: (InteractiveBearerTokenProvider) -> Unit,
    onSuccess: () -> Unit,
    onError: (Exception) -> Unit
): AwsBearerTokenConnection? {
    val requestedScopes = profile.scopes
    val allScopes = requestedScopes.toMutableSet()

    val oldScopeOrEmpty = ToolkitAuthManager.getInstance().getConnection(profile.id)?.let { existingConn ->
        if (existingConn is AwsBearerTokenConnection) {
            existingConn.scopes
        } else {
            null
        }
    }.orEmpty()

    // TODO: what if the old scope is deprecated?
    if (!oldScopeOrEmpty.all { it in requestedScopes }) {
        allScopes.addAll(oldScopeOrEmpty)
    }

    val updatedProfile = profile.copy(scopes = allScopes.toList())

    val connection = try {
        ToolkitAuthManager.getInstance().tryCreateTransientSsoConnection(updatedProfile) { connection ->
            reauthConnectionIfNeeded(project, connection, onPendingToken)
        }
    } catch (e: Exception) {
        onError(e)
        return null
    }

    configFilesFacade.updateSectionInConfig(
        SsoSessionConstants.SSO_SESSION_SECTION_NAME,
        Profile.builder()
            .name(updatedProfile.configSessionName)
            .properties(
                mapOf(
                    ProfileProperty.SSO_START_URL to updatedProfile.startUrl,
                    ProfileProperty.SSO_REGION to updatedProfile.ssoRegion,
                    SsoSessionConstants.SSO_REGISTRATION_SCOPES to updatedProfile.scopes.joinToString(",")
                )
            ).build()
    )
    onSuccess()

    return connection
}

fun ssoErrorMessageFromException(e: Exception) = when (e) {
    is IllegalStateException -> e.message ?: AwsCoreBundle.message("general.unknown_error")
    is ProcessCanceledException -> AwsCoreBundle.message("codewhisperer.credential.login.dialog.exception.cancel_login")
    is InvalidRequestException -> AwsCoreBundle.message("codewhisperer.credential.login.exception.invalid_input")
    is InvalidGrantException, is SsoOidcException -> e.message ?: AwsCoreBundle.message("codewhisperer.credential.login.exception.invalid_grant")
    is ConfigFacadeException -> e.message
    else -> {
        val baseMessage = when (e) {
            is IOException -> "codewhisperer.credential.login.exception.io"
            else -> "codewhisperer.credential.login.exception.general"
        }

        AwsCoreBundle.message(baseMessage, "${e.javaClass.name}: ${e.message}")
    }
}

class ConfigFacadeException(override val cause: Exception) : Exception() {
    override val message: String
        get() = messageFromConfigFacadeError(cause).first

    override fun getStackTrace() = cause.stackTrace
}

fun messageFromConfigFacadeError(e: Exception): Pair<String, String> {
    // we'll consider nested exceptions and exception loops to be out of scope
    val (errorTemplate, errorType) = if (e.stackTrace.any { it.className == ProfileFileReader::class.java.canonicalName }) {
        "gettingstarted.auth.config.issue" to "ConfigParseError"
    } else {
        "codewhisperer.credential.login.exception.general" to e::class.java.name
    }

    val errorMessage = AwsCoreBundle.message(errorTemplate, e.localizedMessage ?: e::class.java.name)

    return errorMessage to errorType
}

fun getCredentialIdForTelemetry(connection: ToolkitConnection): CredentialSourceId =
    if (connection.isSono()) CredentialSourceId.AwsId else CredentialSourceId.IamIdentityCenter
