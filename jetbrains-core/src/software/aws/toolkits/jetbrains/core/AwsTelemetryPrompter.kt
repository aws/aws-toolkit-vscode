// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.notification.Notification
import com.intellij.notification.NotificationDisplayType
import com.intellij.notification.NotificationGroup
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message
import javax.swing.event.HyperlinkEvent

internal const val GROUP_DISPLAY_ID = "AWS Telemetry"

class AwsTelemetryPrompter : StartupActivity {

    override fun runActivity(project: Project) {
        if (!AwsSettings.getInstance().promptedForTelemetry) {
            val group = NotificationGroup(GROUP_DISPLAY_ID, NotificationDisplayType.STICKY_BALLOON, true)

            val notification = group.createNotification(
                message("aws.settings.telemetry.prompt.title"),
                message("aws.settings.telemetry.prompt.message"),
                NotificationType.INFORMATION,
                // 2020.1 fails to compile this when this argument is a lambda instead
                object : NotificationListener {
                    override fun hyperlinkUpdate(notification: Notification, event: HyperlinkEvent) {
                        ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
                        notification.expire()
                    }
                }
            )

            Notifications.Bus.notify(notification, project)

            AwsSettings.getInstance().promptedForTelemetry = true
        }
    }
}
