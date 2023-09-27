// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.gettingstarted

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel
import software.aws.toolkits.jetbrains.settings.GettingStartedSettings
import software.aws.toolkits.telemetry.AuthTelemetry
import software.aws.toolkits.telemetry.CredentialSourceId
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.Result

class GettingStartedOnStartup : StartupActivity {
    override fun runActivity(project: Project) {
        try {
            val settings = GettingStartedSettings.getInstance()
            if (!settings.displayPageFirstInstance) {
                return
            } else {
                GettingStartedPanel.openPanel(project)
                AuthTelemetry.addConnection(
                    project,
                    source = "firstStartup",
                    featureId = FeatureId.Unknown,
                    credentialSourceId = CredentialSourceId.Unknown,
                    isAggregated = true,
                    result = Result.Succeeded
                )
                settings.displayPageFirstInstance = false
            }
        } catch (e: Exception) {
            LOG.error(e) { "Error opening getting started panel" }
            AuthTelemetry.addConnection(
                project,
                source = "firstStartup",
                featureId = FeatureId.Unknown,
                credentialSourceId = CredentialSourceId.Unknown,
                isAggregated = false,
                result = Result.Failed,
                reason = "Error opening getting started panel"
            )
        }
    }

    companion object {
        val LOG = getLogger<GettingStartedOnStartup>()
    }
}
