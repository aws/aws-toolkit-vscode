// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.notification

import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import software.aws.toolkits.resources.message

class JetBrainsMinimumVersionChange : NoticeType {
    override val id: String = "JetBrainsMinimumVersion_202"
    private val noticeContents = NoticeContents(
        message("notice.title.jetbrains.minimum.version"),
        message(
            "notice.message.jetbrains.minimum.version",
            ApplicationInfo.getInstance().fullVersion,
            ApplicationNamesInfo.getInstance().fullProductName,
            "2020.2"
        )
    )

    override fun getSuppressNotificationValue(): String = ApplicationInfo.getInstance().fullVersion

    override fun isNotificationSuppressed(previousSuppressNotificationValue: String?): Boolean {
        if (System.getProperty(SKIP_PROMPT, null)?.toBoolean() == true) {
            return true
        }
        previousSuppressNotificationValue?.let {
            return previousSuppressNotificationValue == getSuppressNotificationValue()
        }
        return false
    }

    override fun isNotificationRequired(): Boolean = ApplicationInfo.getInstance().build.baselineVersion < 202

    override fun getNoticeContents(): NoticeContents = noticeContents
    override fun getNoticeType(): NotificationType = NotificationType.WARNING

    private companion object {
        // Used by tests to make sure the prompt never shows up
        const val SKIP_PROMPT = "aws.suppress_deprecation_prompt"
    }
}
