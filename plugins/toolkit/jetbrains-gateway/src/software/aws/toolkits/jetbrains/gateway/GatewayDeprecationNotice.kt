// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.ide.AppLifecycleListener
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import software.aws.toolkits.resources.message

class GatewayDeprecationNotice : AppLifecycleListener {
    override fun welcomeScreenDisplayed() {
        super.welcomeScreenDisplayed()
        if (ApplicationInfo.getInstance().build.productCode != "GW") return
        if (ApplicationInfo.getInstance().build.baselineVersion >= MIN_VERSION) {
            return
        }
        val title = message("aws.toolkit_deprecation.title")
        val message = message(
            "aws.toolkit_deprecation.message.gateway",
            ApplicationNamesInfo.getInstance().fullProductName,
            ApplicationInfo.getInstance().fullVersion,
            MIN_VERSION_HUMAN
        )

        val notificationGroup = NotificationGroupManager.getInstance().getNotificationGroup("aws.toolkit_deprecation")
        notificationGroup.createNotification(title, message, NotificationType.WARNING).notify(null)
    }

    companion object {
        const val MIN_VERSION = 241
        const val MIN_VERSION_HUMAN = "2024.1"
    }
}
