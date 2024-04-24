// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import org.slf4j.LoggerFactory
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssooidc.model.InvalidGrantException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.amazon.awssdk.services.sts.StsClient
import software.aws.toolkits.core.credentials.validatedSsoIdentifierFromUrl
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.InteractiveBearerTokenProvider
import software.aws.toolkits.jetbrains.utils.runUnderProgressIfNeeded
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CredentialSourceId
import java.io.IOException

private val LOG = LoggerFactory.getLogger("LoginUtils")

sealed interface Login {
    val id: CredentialSourceId

    data class BuilderId(
        val scopes: List<String>,
        val onPendingToken: (InteractiveBearerTokenProvider) -> Unit,
        val onError: (String) -> Unit
    ) : Login {
        override val id: CredentialSourceId = CredentialSourceId.AwsId

        fun loginBuilderId(project: Project): Boolean {
            loginSso(project, SONO_URL, SONO_REGION, scopes, onPendingToken, onError)
            return true
        }
    }

    data class IdC(
        val startUrl: String,
        val region: AwsRegion,
        val scopes: List<String>,
        val onPendingToken: (InteractiveBearerTokenProvider) -> Unit,
        val onError: (String) -> Unit
    ) : Login {
        override val id: CredentialSourceId = CredentialSourceId.IamIdentityCenter
        private val configFilesFacade = DefaultConfigFilesFacade()

        fun loginIdc(project: Project): AwsBearerTokenConnection? {
            // we have this check here so we blow up early if user has an invalid config file
            try {
                configFilesFacade.readSsoSessions()
            } catch (e: Exception) {
                println("Failed to read sso sessions file")
                return null
            }

            val profile = UserConfigSsoSessionProfile(
                configSessionName = validatedSsoIdentifierFromUrl(startUrl),
                ssoRegion = region.id,
                startUrl = startUrl,
                scopes = scopes
            )

            val conn = authAndUpdateConfig(project, profile, configFilesFacade, onPendingToken, onError) ?: return null

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
        val secretKey: String
    ) : Login {
        override val id: CredentialSourceId = CredentialSourceId.SharedCredentials
        private val configFilesFacade = DefaultConfigFilesFacade()

        fun loginIAM(
            project: Project,
            onConfigFileFacadeError: (Exception) -> Unit,
            onProfileAlreadyExist: () -> Unit,
            onConnectionValidationError: () -> Unit
        ): Boolean {
            val existingProfiles = try {
                configFilesFacade.readAllProfiles()
            } catch (e: Exception) {
                onConfigFileFacadeError(e)
                return false
            }

            if (existingProfiles.containsKey(profileName)) {
                onProfileAlreadyExist()
                return false
            }

            val callerIdentity = tryOrNull {
                runUnderProgressIfNeeded(project, message("settings.states.validating.short"), cancelable = true) {
                    AwsClientManager.getInstance().createUnmanagedClient<StsClient>(
                        StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)),
                        Region.AWS_GLOBAL
                    ).use { client ->
                        client.getCallerIdentity()
                    }
                }
            }

            if (callerIdentity == null) {
                onConnectionValidationError()
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
    onError: (String) -> Unit
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
            (connection.getConnectionSettings().tokenProvider.delegate as? InteractiveBearerTokenProvider)?.let {
                onPendingToken(it)
            }
            reauthConnectionIfNeeded(project, connection)
        }
    } catch (e: Exception) {
        val message = ssoErrorMessageFromException(e)

        onError(message)
        LOG.error(e) { "Failed to authenticate: message: $message; profile: $profile" }
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

    return connection
}

internal fun ssoErrorMessageFromException(e: Exception) = when (e) {
    is IllegalStateException -> e.message ?: message("general.unknown_error")
    is ProcessCanceledException -> message("codewhisperer.credential.login.dialog.exception.cancel_login")
    is InvalidRequestException -> message("codewhisperer.credential.login.exception.invalid_input")
    is InvalidGrantException, is SsoOidcException -> e.message ?: message("codewhisperer.credential.login.exception.invalid_grant")
    else -> {
        val baseMessage = when (e) {
            is IOException -> "codewhisperer.credential.login.exception.io"
            else -> "codewhisperer.credential.login.exception.general"
        }

        message(baseMessage, "${e.javaClass.name}: ${e.message}")
    }
}
