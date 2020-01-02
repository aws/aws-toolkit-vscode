// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications.Bus.notify
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogBuilder
import com.intellij.ui.ScrollPaneFactory
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.credentials.SettingsSelectorAction
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.settings.AwsSettingsConfigurable
import software.aws.toolkits.resources.message
import javax.swing.JLabel
import javax.swing.JTextArea

private const val GROUP_DISPLAY_ID = "AWS Toolkit"
private val LOG = getLogger<AwsToolkit>()

fun Throwable.notifyError(title: String = "", project: Project? = null) {
    val message = this.message ?: "${this::class.java.name}${this.stackTrace?.joinToString("\n", prefix = "\n")}"
    LOG.warn(this) { title.takeIf { it.isNotBlank() }?.let { "$it ($message)" } ?: message }
    notify(
        Notification(
            GROUP_DISPLAY_ID,
            title,
            message,
            NotificationType.ERROR
        ), project
    )
}

private fun notify(type: NotificationType, title: String, content: String = "", project: Project? = null, notificationActions: Collection<AnAction>) {
    val notification = Notification(GROUP_DISPLAY_ID, title, content, type)

    notificationActions.forEach {
        notification.addAction(it)
    }

    notify(notification, project)
}

fun notifyInfo(title: String, content: String = "", project: Project? = null, listener: NotificationListener? = null) =
    notify(Notification(GROUP_DISPLAY_ID, title, content, NotificationType.INFORMATION, listener), project)

fun notifyInfo(title: String, content: String = "", project: Project? = null, notificationActions: Collection<AnAction>) =
    notify(NotificationType.INFORMATION, title, content, project, notificationActions)

fun notifyWarn(title: String, content: String = "", project: Project? = null, notificationActions: Collection<AnAction>) =
    notify(NotificationType.WARNING, title, content, project, notificationActions)

fun notifyWarn(title: String, content: String = "", project: Project? = null, listener: NotificationListener? = null) =
    notify(Notification(GROUP_DISPLAY_ID, title, content, NotificationType.WARNING, listener), project)

fun notifyError(title: String, content: String = "", project: Project? = null, action: AnAction) =
    notify(NotificationType.ERROR, title, content, project, listOf(action))

fun notifyError(title: String = message("aws.notification.title"), content: String = "", project: Project? = null, listener: NotificationListener? = null) =
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

/**
 * Creates a Notification Action that will expire a notification after performing some AnAction
 */
fun createNotificationExpiringAction(action: AnAction): NotificationAction = NotificationAction.create(
    action.templatePresentation.text
) { actionEvent, notification ->
    action.actionPerformed(actionEvent)
    notification.expire()
}

fun createShowMoreInfoDialogAction(actionName: String?, title: String?, message: String?, moreInfo: String?) =
    object : AnAction(actionName) {
        override fun isDumbAware() = true

        override fun actionPerformed(e: AnActionEvent) {
            val dialogTitle = title ?: ""

            val textArea = JTextArea(moreInfo).apply {
                columns = 50
                rows = 5
                lineWrap = true
                wrapStyleWord = true
                isEditable = false
            }

            val dialogBuilder = DialogBuilder().apply {
                setTitle(dialogTitle)
                setNorthPanel(JLabel(message))
                setCenterPanel(ScrollPaneFactory.createScrollPane(textArea))
                setPreferredFocusComponent(textArea)
                setHelpId(HelpIds.SETUP_CREDENTIALS.id)
                removeAllActions()
                addOkAction()
            }

            dialogBuilder.show()
        }
    }
