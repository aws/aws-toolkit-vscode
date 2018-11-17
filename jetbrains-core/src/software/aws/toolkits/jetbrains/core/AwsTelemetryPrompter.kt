// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.notification.NotificationListener
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class AwsTelemetryPrompter : StartupActivity {

    override fun runActivity(project: Project) {
        if (!AwsSettings.getInstance().promptedForTelemetry) {
            notifyInfo(title = message("aws.settings.telemetry.prompt.title"),
                    content = message("aws.settings.telemetry.prompt.message"),
                    project = project,
                    listener = NotificationListener { notification, _ ->
                        ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
                        notification.expire()
                    })
            AwsSettings.getInstance().promptedForTelemetry = true
        }
    }
}