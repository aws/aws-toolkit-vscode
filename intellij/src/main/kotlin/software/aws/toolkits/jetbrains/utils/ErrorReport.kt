package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.Notification
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications

fun notifyException(action: String, e: Exception) =
        Notifications.Bus.notify(Notification("AWS Tookit", action, e.message ?: e.javaClass.name, NotificationType.ERROR))