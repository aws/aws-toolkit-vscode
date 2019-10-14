// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.notification

import com.intellij.notification.NotificationDisplayType
import com.intellij.notification.NotificationGroup
import com.intellij.notification.NotificationType
import com.intellij.notification.Notifications
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import software.aws.toolkits.resources.message

interface NoticeManager {
    fun getRequiredNotices(notices: List<NoticeType>, project: Project): List<NoticeType>
    fun notify(notices: List<NoticeType>, project: Project)

    companion object {
        fun getInstance(): NoticeManager = ServiceManager.getService(NoticeManager::class.java)
    }
}

internal const val NOTICE_NOTIFICATION_GROUP_ID = "AWS Toolkit Notices"

@State(name = "notices", storages = [Storage("aws.xml")])
class DefaultNoticeManager : PersistentStateComponent<NoticeStateList>,
    NoticeManager {
    private val internalState = mutableMapOf<String, NoticeState>()
    private val notificationGroup = NotificationGroup(NOTICE_NOTIFICATION_GROUP_ID, NotificationDisplayType.STICKY_BALLOON, true)

    override fun getState(): NoticeStateList = NoticeStateList(internalState.values.map { it }.toList())

    override fun loadState(state: NoticeStateList) {
        internalState.clear()
        state.value.forEach {
            val id = it.id ?: return@forEach
            internalState[id] = it
        }
    }

    /**
     * Returns the notices that require notification
     */
    override fun getRequiredNotices(notices: List<NoticeType>, project: Project): List<NoticeType> = notices.filter { it.isNotificationRequired() }
        .filter {
            internalState[it.id]?.let { state ->
                state.noticeSuppressedValue?.let { previouslySuppressedValue ->
                    return@filter !it.isNotificationSuppressed(previouslySuppressedValue)
                }
            }

            true
        }

    override fun notify(notices: List<NoticeType>, project: Project) {
        notices.forEach { notify(it, project) }
    }

    private fun notify(notice: NoticeType, project: Project) {
        val notification = notificationGroup.createNotification(
            notice.getNoticeContents().title,
            notice.getNoticeContents().message,
            NotificationType.INFORMATION,
            null
        )

        notification.addAction(
            object : AnAction(message("notice.suppress")) {
                override fun actionPerformed(e: AnActionEvent) {
                    suppressNotification(notice)
                    notification.hideBalloon()
                }
            }
        )

        Notifications.Bus.notify(notification, project)
    }

    fun suppressNotification(notice: NoticeType) {
        internalState[notice.id] = NoticeState(notice.id, notice.getSuppressNotificationValue())
    }

    fun resetAllNotifications() {
        internalState.clear()
    }
}

data class NoticeStateList(var value: List<NoticeState> = listOf())

data class NoticeState(
    var id: String? = null,
    var noticeSuppressedValue: String? = null
)
