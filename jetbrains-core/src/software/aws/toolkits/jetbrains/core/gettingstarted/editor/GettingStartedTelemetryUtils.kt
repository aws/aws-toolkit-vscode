// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted.editor

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialsIdentifierSso

fun getConnectionCount(): Int {
    val bearerTokenCount = ToolkitAuthManager.getInstance().listConnections().size
    val iamCredentialCount = CredentialManager.getInstance().getCredentialIdentifiers().count { it !is ProfileCredentialsIdentifierSso }
    return bearerTokenCount + iamCredentialCount
}

fun getEnabledConnectionsForTelemetry(project: Project): Set<AuthFormId> {
    val enabledConnections = mutableSetOf<AuthFormId>()
    val explorerConnection = checkIamConnectionValidity(project)
    if (explorerConnection !is ActiveConnection.NotConnected) {
        if (explorerConnection.connectionType == ActiveConnectionType.IAM_IDC) {
            enabledConnections.add(AuthFormId.IDENTITYCENTER_EXPLORER)
        } else {
            enabledConnections.add(
                AuthFormId.IAMCREDENTIALS_EXPLORER
            )
        }
    }
    val codeCatalystConnection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODECATALYST) // Currently this will always be builder id
    if (codeCatalystConnection !is ActiveConnection.NotConnected) enabledConnections.add(AuthFormId.BUILDERID_CODECATALYST)

    val codeWhispererConnection = checkBearerConnectionValidity(project, BearerTokenFeatureSet.CODEWHISPERER)
    if (codeWhispererConnection !is ActiveConnection.NotConnected) {
        if (codeWhispererConnection.connectionType == ActiveConnectionType.IAM_IDC) {
            enabledConnections.add(AuthFormId.IDENTITYCENTER_CODEWHISPERER)
        } else {
            enabledConnections.add(
                AuthFormId.BUILDERID_CODEWHISPERER
            )
        }
    }
    return enabledConnections
}

fun getEnabledConnections(project: Project): String =
    getEnabledConnectionsForTelemetry(project).joinToString(",")

enum class AuthFormId {
    IAMCREDENTIALS_EXPLORER,
    IDENTITYCENTER_EXPLORER,
    BUILDERID_CODECATALYST,
    BUILDERID_CODEWHISPERER,
    IDENTITYCENTER_CODEWHISPERER,
    UNKNOWN
}
