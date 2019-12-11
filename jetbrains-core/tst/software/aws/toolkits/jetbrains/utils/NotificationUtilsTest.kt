// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import kotlin.test.assertNotNull

class NotificationUtilsTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun notificationOnExceptionWithoutMessageShowsStackTrace() {
        val project = projectRule.project

        val messageBus = project.messageBus.connect()
        var notification: Notification? = null
        messageBus.setDefaultHandler { _, params ->
            notification = params[0] as Notification
        }
        messageBus.subscribe(Notifications.TOPIC)

        NullPointerException().notifyError("ooops", project = project)

        assertNotNull(notification) {
            assertThat(it.content)
                .startsWith("java.lang.NullPointerException")
                .contains("NotificationUtilsTest.kt")
        }
    }
}
