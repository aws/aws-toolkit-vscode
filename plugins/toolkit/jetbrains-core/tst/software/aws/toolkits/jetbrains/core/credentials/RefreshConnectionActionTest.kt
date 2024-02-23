// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.AwsResourceCacheTest.Companion.dummyResource
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class RefreshConnectionActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val sut = RefreshConnectionAction()

    @Test
    fun refreshActionClearsCacheAndUpdatesConnectionState() {
        resourceCache.addEntry(projectRule.project, dummyResource(), aString())

        val latch = CountDownLatch(1)
        val states = ConcurrentHashMap.newKeySet<ConnectionState>()
        projectRule.project.messageBus.connect()
            .subscribe(
                AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED,
                object : ConnectionSettingsStateChangeNotifier {
                    override fun settingsStateChanged(newState: ConnectionState) {
                        states.add(newState)
                        latch.countDown()
                    }
                }
            )

        sut.actionPerformed(testAction())

        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue

        assertThat(resourceCache.size()).isZero()
        assertThat(states).hasAtLeastOneElementOfType(ConnectionState.ValidatingConnection::class.java)
    }

    @Test
    fun actionIsEnabledIfConnectionStateIsInvalid() {
        checkExpectedActionState(ConnectionState.InvalidConnection(RuntimeException("Boom")), shouldBeEnabled = true)
    }

    @Test
    fun actionIsEnabledIfConnectionStateIsValid() {
        checkExpectedActionState(ConnectionState.ValidConnection(aToolkitCredentialsProvider(), anAwsRegion()), shouldBeEnabled = true)
    }

    @Test
    fun actionIsDisabledIfConnectionStateIsIncomplete() {
        checkExpectedActionState(ConnectionState.IncompleteConfiguration(null, null), shouldBeEnabled = false)
    }

    @Test
    fun actionIsDisabledIfConnectionStateIsNotTerminal() {
        checkExpectedActionState(ConnectionState.InitializingToolkit, shouldBeEnabled = false)
    }

    private fun checkExpectedActionState(connectionState: ConnectionState, shouldBeEnabled: Boolean) {
        val mockProjectAccountSettingsManager = MockAwsConnectionManager.getInstance(projectRule.project)

        mockProjectAccountSettingsManager.setConnectionState(connectionState)

        val actionEvent = testAction()
        sut.update(actionEvent)

        assertThat(actionEvent.presentation.isEnabled).isEqualTo(shouldBeEnabled)
    }

    private fun testAction() = TestActionEvent(DataContext { projectRule.project })
}
