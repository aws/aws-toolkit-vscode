// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.rules

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ProjectRule
import org.junit.rules.ExternalResource
import java.util.concurrent.CopyOnWriteArrayList

class NotificationListenerRule : ExternalResource {
    private val projectSupplier: () -> Project
    private val disposable: Disposable

    constructor(projectRule: ProjectRule, disposable: Disposable) : super() {
        this.projectSupplier = { projectRule.project }
        this.disposable = disposable
        this.notifications = CopyOnWriteArrayList<Notification>()
    }

    constructor(projectRule: CodeInsightTestFixtureRule, disposable: Disposable) : super() {
        this.projectSupplier = { projectRule.project }
        this.disposable = disposable
        this.notifications = CopyOnWriteArrayList<Notification>()
    }

    val notifications: CopyOnWriteArrayList<Notification>

    override fun before() {
        projectSupplier().messageBus.connect(disposable).subscribe(
            Notifications.TOPIC,
            object : Notifications {
                override fun notify(notification: Notification) {
                    notifications.add(notification)
                }
            }
        )
        notifications.clear()
    }
}
