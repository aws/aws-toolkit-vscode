// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.notification

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import software.aws.toolkits.resources.message

class JetBrainsMinimumVersionChange : NoticeType {
    override val id: String = "JetBrainsMinimumVersion_201"
    private val noticeContents = NoticeContents(
        message("notice.title.jetbrains.minimum.version"),
        message(
            "notice.message.jetbrains.minimum.version",
            ApplicationInfo.getInstance().fullVersion,
            ApplicationNamesInfo.getInstance().fullProductName,
            "2020.1"
        )
    )

    override fun getSuppressNotificationValue(): String = ApplicationInfo.getInstance().fullVersion

    override fun isNotificationSuppressed(previousSuppressNotificationValue: String?): Boolean {
        previousSuppressNotificationValue?.let {
            return previousSuppressNotificationValue == getSuppressNotificationValue()
        }
        return false
    }

    override fun isNotificationRequired(): Boolean {
        val appInfo = ApplicationInfo.getInstance()
        val majorVersion = appInfo.majorVersion.toIntOrNull()

        majorVersion?.let {
            return majorVersion < 2020
        }

        return true
    }

    override fun getNoticeContents(): NoticeContents = noticeContents
    override fun getNoticeType(): NotificationType = NotificationType.WARNING
}
