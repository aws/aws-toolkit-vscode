// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource

class NotificationUtilsTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val notificationListener = NotificationListenerRule(projectRule)

    @Test
    fun `Notifications show stack traces for exceptions`() {
        NullPointerException().notifyError("ooops", project = projectRule.project)

        assertThat(notificationListener.notifications).hasOnlyOneElementSatisfying {
            assertThat(it.content)
                .startsWith("java.lang.NullPointerException")
                .contains("NotificationUtilsTest.kt")
        }
    }
}

class NotificationListenerRule(private val projectRule: ProjectRule) : ExternalResource() {
    val notifications = mutableListOf<Notification>()

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
