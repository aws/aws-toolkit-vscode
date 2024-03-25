// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.NotificationListener
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode
import software.aws.toolkits.jetbrains.core.credentials.ConfigureAwsConnectionAction
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message

/**
 * Notify error that AWS credentials are not configured.
 */
fun notifyNoActiveCredentialsError(
    project: Project,
    title: String = message("aws.notification.title"),
    content: String = message("aws.notification.credentials_missing")
) {
    notifyError(
        title = title,
        content = content,
        project = project,
        action = ConfigureAwsConnectionAction(ChangeSettingsMode.CREDENTIALS)
    )
}

/**
 * Notify error that AWS SAM CLI is not valid.
 */
fun notifySamCliNotValidError(
    project: Project,
    title: String = message("aws.notification.title"),
    content: String
) {
    notifyError(
        title = title,
        content = message("aws.notification.sam_cli_not_valid", content),
        project = project,
        listener = NotificationListener { notification, _ ->
            ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsSettingsConfigurable::class.java)
            notification.expire()
        },
        stripHtml = false
    )
}
