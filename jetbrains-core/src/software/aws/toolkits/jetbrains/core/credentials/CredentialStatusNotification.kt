// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
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
            val message = newState.displayMessage

            notifyWarn(
                project = project,
                title = title,
                content = message,
                notificationActions = listOf(
                    createShowMoreInfoDialogAction(
                        message("credentials.invalid.more_info"),
                        title,
                        message,
                        newState.cause.localizedMessage
                    ),
                    createNotificationExpiringAction(actionManager.getAction("aws.settings.upsertCredentials")),
                    createNotificationExpiringAction(object : AnAction(message("settings.retry")) {
                        override fun actionPerformed(e: AnActionEvent) {
                            actionManager.getAction("aws.settings.refresh").actionPerformed(e)
                        }
                    })
                )
            )
        }
    }
}
