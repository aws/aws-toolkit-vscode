// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.configurationStore.getPersistentStateComponentStorageLocation
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getConnectionCount
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.getEnabledConnections
import software.aws.toolkits.jetbrains.settings.GettingStartedSettings
import software.aws.toolkits.telemetry.AuthTelemetry
import software.aws.toolkits.telemetry.CredentialSourceId
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result

class GettingStartedOnStartup : StartupActivity {
    override fun runActivity(project: Project) {
        try {
            val hasStartedToolkitBefore = tryOrNull {
                getPersistentStateComponentStorageLocation(GettingStartedSettings::class.java)?.exists()
            } ?: true

            if (hasStartedToolkitBefore && CredentialManager.getInstance().getCredentialIdentifiers().isNotEmpty()) {
                GettingStartedSettings.getInstance().shouldDisplayPage = false
            }

            val settings = GettingStartedSettings.getInstance()
            if (!settings.shouldDisplayPage) {
                return
            } else {
                GettingStartedPanel.openPanel(project, firstInstance = true, connectionInitiatedFromExplorer = false)
                AuthTelemetry.addConnection(
                    project,
                    source = SourceOfEntry.FIRST_STARTUP.toString(),
                    featureId = FeatureId.Unknown,
                    credentialSourceId = CredentialSourceId.Unknown,
                    isAggregated = true,
                    result = Result.Succeeded
                )
                AuthTelemetry.addedConnections(
                    project,
                    source = SourceOfEntry.FIRST_STARTUP.toString(),
                    authConnectionsCount = getConnectionCount(),
                    newAuthConnectionsCount = 0,
                    enabledAuthConnections = getEnabledConnections(project),
                    newEnabledAuthConnections = "",
                    attempts = 1,
                    result = Result.Succeeded
                )
                settings.shouldDisplayPage = false
            }
        } catch (e: Exception) {
            LOG.error(e) { "Error opening getting started panel" }
            AuthTelemetry.addConnection(
                project,
                source = SourceOfEntry.FIRST_STARTUP.toString(),
                featureId = FeatureId.Unknown,
                credentialSourceId = CredentialSourceId.Unknown,
                isAggregated = false,
                result = Result.Failed,
                reason = "Error opening getting started panel"
            )
            AuthTelemetry.addedConnections(
                project,
                source = SourceOfEntry.FIRST_STARTUP.toString(),
                authConnectionsCount = getConnectionCount(),
                newAuthConnectionsCount = 0,
                enabledAuthConnections = getEnabledConnections(project),
                newEnabledAuthConnections = "",
                attempts = 1,
                result = Result.Failed
            )
        }
    }

    companion object {
        val LOG = getLogger<GettingStartedOnStartup>()
    }
}
