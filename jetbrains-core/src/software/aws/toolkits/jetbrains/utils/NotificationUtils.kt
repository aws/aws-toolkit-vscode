package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.Notification
import com.intellij.notification.NotificationListener
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications.Bus.notify
import com.intellij.openapi.project.Project

const val GROUP_DISPLAY_ID = "AWS Toolkit"

fun Exception.notifyError(title: String, project: Project? = null) =
        notify(
                Notification(
                        GROUP_DISPLAY_ID,
                        title,
                        this.message ?: this::class.java.name + this.stackTrace?.joinToString("\n", prefix = "\n"),
                        NotificationType.ERROR
                ), project
        )

fun notifyError(title: String, project: Project? = null) = notify(Notification(GROUP_DISPLAY_ID, title, "", NotificationType.ERROR), project)

fun notifyInfo(title: String, content: String = "", project: Project? = null, listener: NotificationListener? = null) =
        notify(Notification(GROUP_DISPLAY_ID, title, content, NotificationType.INFORMATION, listener), project)