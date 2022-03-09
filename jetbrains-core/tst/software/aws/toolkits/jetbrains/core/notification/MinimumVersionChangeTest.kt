// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.notification

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.impl.SimpleDataContext
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.BuildNumber
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import software.aws.toolkits.core.rules.SystemPropertyHelper
import software.aws.toolkits.jetbrains.utils.rules.NotificationListenerRule
import java.util.Calendar

class MinimumVersionChangeTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val systemProperties = SystemPropertyHelper()

    @Rule
    @JvmField
    val notifications = NotificationListenerRule(projectRule, disposableRule.disposable)

    private lateinit var sut: MinimumVersionChange
    private lateinit var applicationInfo: ApplicationInfo

    @Before
    fun setup() {
        applicationInfo = mock {
            on { buildDate } doReturn Calendar.getInstance() // Avoids a NPE in IdeaFormatWriter, doesn't hurt but spams logs
        }
        ApplicationManager.getApplication().replaceService(ApplicationInfo::class.java, applicationInfo, disposableRule.disposable)

        sut = MinimumVersionChange(isUnderTest = true)

        PropertiesComponent.getInstance().unsetValue(MinimumVersionChange.IGNORE_PROMPT)
    }

    @Before
    fun tearDown() {
        PropertiesComponent.getInstance().unsetValue(MinimumVersionChange.IGNORE_PROMPT)
    }

    @Test
    fun `notice is hidden if system property is set`() {
        System.setProperty(MinimumVersionChange.SKIP_PROMPT, "true")
        sut.runActivity(projectRule.project)

        assertThat(notifications.notifications).isEmpty()
    }

    @Test
    fun `notice is hidden if suppressed before`() {
        PropertiesComponent.getInstance().setValue(MinimumVersionChange.IGNORE_PROMPT, true)
        sut.runActivity(projectRule.project)

        assertThat(notifications.notifications).isEmpty()
    }

    @Test
    fun `notice is hidden if IDE is above max version`() {
        applicationInfo.stub {
            on { build } doReturn BuildNumber("IC", 999, 999)
        }

        sut.runActivity(projectRule.project)

        assertThat(notifications.notifications).isEmpty()
    }

    @Test
    fun `notice is hidden if IDE is at min version version`() {
        applicationInfo.stub {
            on { build } doReturn BuildNumber("IC", MinimumVersionChange.MIN_VERSION, 999)
        }

        sut.runActivity(projectRule.project)

        assertThat(notifications.notifications).isEmpty()
    }

    @Test
    fun `notice is shown if IDE is below min version`() {
        applicationInfo.stub {
            on { build } doReturn BuildNumber("IC", 123, 456)
            on { fullVersion } doReturn "2012.3"
        }

        sut.runActivity(projectRule.project)

        assertThat(notifications.notifications).singleElement().satisfies {
            assertThat(it.content).matches("""Support for [\w ]+ 2012\.3 is being deprecated .*""".toPattern())
            assertThat(it.actions).singleElement()
        }
    }

    @Test
    fun `don't show again sets the setting`() {
        applicationInfo.stub {
            on { build } doReturn BuildNumber("IC", 123, 456)
            on { fullVersion } doReturn "2032.1"
        }

        sut.runActivity(projectRule.project)

        // While this code should never throw...the DateKey for the Notification is private, so we can't make this logic 100% safe forever.
        // The logic that makes use of it is to dismiss the balloon and runs after our logic, so it should be safe.
        runCatching {
            val notification = notifications.notifications.first()
            val context = SimpleDataContext.builder()
                .add(DataKey.create("Notification"), notification)
                .build()
            val actionEvent = TestActionEvent(context)
            notification.actions.first().actionPerformed(actionEvent)
        }

        assertThat(PropertiesComponent.getInstance().getBoolean(MinimumVersionChange.IGNORE_PROMPT)).isTrue
    }
}
