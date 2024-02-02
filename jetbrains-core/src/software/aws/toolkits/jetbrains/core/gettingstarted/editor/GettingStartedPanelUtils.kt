// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted.editor

import com.intellij.openapi.project.Project
import com.intellij.ui.dsl.builder.Panel
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.lazyIsUnauthedBearerConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeCatalystConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.gettingstarted.SourceOfEntry
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend

enum class ActiveConnectionType {
    BUILDER_ID,
    IAM_IDC,
    IAM,
    UNKNOWN
}

enum class BearerTokenFeatureSet {
    CODEWHISPERER,
    CODECATALYST,
    Q
}

fun controlPanelVisibility(currentPanel: Panel, newPanel: Panel) {
    currentPanel.visible(false)
    newPanel.visible(true)
}

sealed interface ActiveConnection {
    val activeConnectionBearer: AwsBearerTokenConnection?
    val connectionType: ActiveConnectionType?
    val activeConnectionIam: CredentialIdentifier?

    data class ExpiredBearer(
        override val activeConnectionBearer: AwsBearerTokenConnection?,
        override val connectionType: ActiveConnectionType?,
        override val activeConnectionIam: CredentialIdentifier? = null
    ) : ActiveConnection

    data class ExpiredIam(
        override val activeConnectionBearer: AwsBearerTokenConnection? = null,
        override val connectionType: ActiveConnectionType?,
        override val activeConnectionIam: CredentialIdentifier?
    ) : ActiveConnection

    data class ValidBearer(
        override val activeConnectionBearer: AwsBearerTokenConnection?,
        override val connectionType: ActiveConnectionType?,
        override val activeConnectionIam: CredentialIdentifier? = null
    ) : ActiveConnection

    data class ValidIam(
        override val activeConnectionBearer: AwsBearerTokenConnection? = null,
        override val connectionType: ActiveConnectionType?,
        override val activeConnectionIam: CredentialIdentifier?
    ) : ActiveConnection

    object NotConnected : ActiveConnection {
        override val activeConnectionBearer: AwsBearerTokenConnection?
            get() = null

        override val connectionType: ActiveConnectionType?
            get() = null

        override val activeConnectionIam: CredentialIdentifier?
            get() = null
    }
}

fun checkBearerConnectionValidity(project: Project, source: BearerTokenFeatureSet): ActiveConnection {
    val connections = ToolkitAuthManager.getInstance().listConnections().filterIsInstance<AwsBearerTokenConnection>()
    if (connections.isEmpty()) return ActiveConnection.NotConnected

    val activeConnection = when (source) {
        BearerTokenFeatureSet.CODEWHISPERER -> ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(
            CodeWhispererConnection.getInstance()
        )
        BearerTokenFeatureSet.CODECATALYST -> ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(
            CodeCatalystConnection.getInstance()
        )
        BearerTokenFeatureSet.Q -> ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(
            QConnection.getInstance()
        )
    } ?: return ActiveConnection.NotConnected

    activeConnection as AwsBearerTokenConnection
    val connectionType = if (activeConnection.startUrl == SONO_URL) ActiveConnectionType.BUILDER_ID else ActiveConnectionType.IAM_IDC
    return if (activeConnection.lazyIsUnauthedBearerConnection()) {
        ActiveConnection.ExpiredBearer(activeConnection, connectionType)
    } else {
        ActiveConnection.ValidBearer(activeConnection, connectionType)
    }
}

fun checkIamConnectionValidity(project: Project): ActiveConnection {
    val currConn = AwsConnectionManager.getInstance(project).selectedCredentialIdentifier ?: return ActiveConnection.NotConnected
    val invalidConnection = AwsConnectionManager.getInstance(project).connectionState.let { it.isTerminal && it !is ConnectionState.ValidConnection }
    return if (invalidConnection) {
        ActiveConnection.ExpiredIam(connectionType = isCredentialSso(currConn.shortName), activeConnectionIam = currConn)
    } else {
        ActiveConnection.ValidIam(connectionType = isCredentialSso(currConn.shortName), activeConnectionIam = currConn)
    }
}

fun isCredentialSso(providerId: String): ActiveConnectionType {
    val profileName = providerId.split("-").first()
    val ssoSessionIds = CredentialManager.getInstance().getSsoSessionIdentifiers().map {
        it.id.substringAfter(
            "${SsoSessionConstants.SSO_SESSION_SECTION_NAME}:"
        )
    }
    return if (profileName in ssoSessionIds) ActiveConnectionType.IAM_IDC else ActiveConnectionType.IAM
}

fun getSourceOfEntry(
    sourceOfEntry: SourceOfEntry,
    isStartup: Boolean = false,
    connectionInitiatedFromExplorer: Boolean = false,
    connectionInitiatedFromQChatPanel: Boolean = false
): String {
    val src = if (connectionInitiatedFromExplorer) {
        SourceOfEntry.EXPLORER.toString()
    } else if (connectionInitiatedFromQChatPanel) {
        SourceOfEntry.AMAZONQ_CHAT_PANEL.toString()
    } else {
        sourceOfEntry.toString()
    }
    val source = if (isStartup) SourceOfEntry.FIRST_STARTUP.toString() else src
    return if (isRunningOnRemoteBackend()) "REMOTE_$source" else source
}
