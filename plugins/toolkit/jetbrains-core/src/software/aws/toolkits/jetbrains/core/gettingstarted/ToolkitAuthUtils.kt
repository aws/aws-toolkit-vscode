// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.DefaultConfigFilesFacade
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.authAndUpdateConfig
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.resources.message

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

                authAndUpdateConfig(project, profile, configFilesFacade, {}, {}) { e ->
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
