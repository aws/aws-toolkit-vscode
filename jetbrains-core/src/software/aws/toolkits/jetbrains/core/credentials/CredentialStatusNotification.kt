// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyWarn
import software.aws.toolkits.resources.message

class CredentialStatusNotification(private val project: Project) : ConnectionSettingsStateChangeNotifier {
    private val actionManager = ActionManager.getInstance()
    override fun settingsStateChanged(newState: ConnectionState) {
        if (newState is ConnectionState.InvalidConnection) {
            val title = message("credentials.invalid.title")
            val message = message("credentials.invalid.description")

            notifyWarn(
                project = project,
                title = title,
                content = message,
                notificationActions = listOf(
                    createShowMoreInfoDialogAction(
                        message("credentials.invalid.more_info"),
                        title,
                        message,
                        newState.displayMessage
                    ),
                    createNotificationExpiringAction(actionManager.getAction("aws.settings.upsertCredentials")),
                    createNotificationExpiringAction(RefreshConnectionAction(message("settings.retry")))
                )
            )
        }
    }
}
