// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.Notification
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications.Bus.notify
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.SettingsSelectorAction
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message

const val GROUP_DISPLAY_ID = "AWS Toolkit"

fun Exception.notifyError(title: String = "", project: Project? = null) =
        notify(
                Notification(
                        GROUP_DISPLAY_ID,
                        title,
                        this.message ?: "${this::class.java.name}${this.stackTrace?.joinToString("\n", prefix = "\n")}",
                        NotificationType.ERROR
                ), project
        )

fun notifyInfo(title: String, content: String = "", project: Project? = null, listener: NotificationListener? = null) =
        notify(Notification(GROUP_DISPLAY_ID, title, content, NotificationType.INFORMATION, listener), project)

fun notifyError(title: String, content: String = "", project: Project? = null, action: AnAction) =
        notify(Notification(GROUP_DISPLAY_ID, title, content, NotificationType.ERROR).addAction(action), project)

fun notifyError(title: String, content: String = "", project: Project? = null, listener: NotificationListener? = null) =
        notify(Notification(GROUP_DISPLAY_ID, title, content, NotificationType.ERROR, listener), project)

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
        action = SettingsSelectorAction(showRegions = false)
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
        }
    )
}

fun <T> tryNotify(message: String, block: () -> T): T? = try {
    block()
} catch (e: Exception) {
    e.notifyError(message)
    null
}