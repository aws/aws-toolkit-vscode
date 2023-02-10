// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message

class AwsTelemetryPrompter : StartupActivity.Background {
    override fun runActivity(project: Project) {
        if (AwsSettings.getInstance().promptedForTelemetry || System.getProperty("aws.telemetry.skip_prompt", null)?.toBoolean() == true) {
            return
        }

        val notification = Notification(
            "aws.toolkit_telemetry",
            message("aws.settings.telemetry.prompt.title"),
            message("aws.settings.telemetry.prompt.message"),
            NotificationType.INFORMATION
        ).also {
            it.setListener { notification, _ ->
                ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
                notification.expire()
            }
        }

        notification.notify(project)

        AwsSettings.getInstance().promptedForTelemetry = true
    }
}
