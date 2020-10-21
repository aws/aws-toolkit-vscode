// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.notification

import com.intellij.notification.NotificationType
import com.intellij.openapi.extensions.ExtensionPointName

interface NoticeType {
    val id: String

    // The value persisted to represent that this notice has been suppressed
    fun getSuppressNotificationValue(): String

    // Indicates whether or not a suppressed notice should remain suppressed
    fun isNotificationSuppressed(previousSuppressNotificationValue: String?): Boolean

    fun isNotificationRequired(): Boolean

    // Notification Title/Message
    fun getNoticeContents(): NoticeContents

    /*
     * Allow setting different warning levels depending on the type of notification
     */
    open fun getNoticeType(): NotificationType = NotificationType.INFORMATION

    companion object {
        val EP_NAME = ExtensionPointName<NoticeType>("aws.toolkit.notice")

        internal fun notices(): List<NoticeType> = EP_NAME.extensions.toList()
    }
}

data class NoticeContents(val title: String, val message: String)
