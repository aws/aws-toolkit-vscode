// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.testFramework.ProjectRule
import org.junit.rules.ExternalResource
import java.util.concurrent.CopyOnWriteArrayList

class NotificationListenerRule(private val projectRule: ProjectRule) : ExternalResource() {
    val notifications = CopyOnWriteArrayList<Notification>()

    override fun before() {
        with(projectRule.project.messageBus.connect()) {
            setDefaultHandler { _, params ->
                notifications.add(params[0] as Notification)
            }
            subscribe(Notifications.TOPIC)
        }
        notifications.clear()
    }
}
