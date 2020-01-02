// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message

class CredentialStatusNotification : StartupActivity, DumbAware, ConnectionSettingsChangeNotifier {
    override fun runActivity(project: Project) {
        project.messageBus.connect().subscribe(ProjectAccountSettingsManager.CONNECTION_SETTINGS_CHANGED, this)
    }

    override fun settingsChanged(event: ConnectionSettingsChangeEvent) {
        if (event is InvalidConnectionSettings) {
            val title = message("credentials.invalid.title")
            val message = message("credentials.profile.validation_error", event.credentialsProvider.displayName)
            notifyWarn(
                title = title,
                content = message,
                notificationActions = listOf(
                    createShowMoreInfoDialogAction(
                        message("credentials.invalid.more_info"),
                        title,
                        message,
                        event.cause.localizedMessage
                    ),
                    createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
                )
            )
        }
    }
}
