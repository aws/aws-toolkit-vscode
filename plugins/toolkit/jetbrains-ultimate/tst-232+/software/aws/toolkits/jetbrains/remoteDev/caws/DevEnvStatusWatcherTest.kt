// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.openapi.ui.TestDialog
import com.intellij.openapi.ui.TestDialogManager
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class DevEnvStatusWatcherTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun `Heartbeat check stops if no response is returned by the API`() {
        val sut = DevEnvStatusWatcher()
        val devEnvStatusWatcher = spy<DevEnvStatusWatcher>(sut) {
            doReturn(600.toLong()).whenever(it).getJbRecordedActivity()
            doReturn(null).whenever(it).getLastRecordedApiActivity()
        }
        val response = devEnvStatusWatcher.checkHeartbeat(0, 0, projectRule.project)
        assertThat(response.first).isTrue()
    }

    @Test
    fun `API is called if user extends the timeout 5 minutes before inactivity timeout`() {
        val sut = DevEnvStatusWatcher()
        val devEnvStatusWatcher = spy<DevEnvStatusWatcher>(sut) {
            doReturn(600.toLong()).whenever(it).getJbRecordedActivity()
            doReturn("1672531261000").whenever(it).getLastRecordedApiActivity()
        }
        TestDialogManager.setTestDialog(TestDialog.OK)
        devEnvStatusWatcher.checkHeartbeat(0, 900, projectRule.project)
        verify(devEnvStatusWatcher).notifyBackendOfActivity(any())
    }

    @Test
    fun `API is not called if user doesn't extend the timeout 5 minutes before inactivity timeout`() {
        val sut = DevEnvStatusWatcher()
        val devEnvStatusWatcher = spy<DevEnvStatusWatcher>(sut) {
            doReturn(600.toLong()).whenever(it).getJbRecordedActivity()
            doReturn("1672531261000").whenever(it).getLastRecordedApiActivity()
        }
        TestDialogManager.setTestDialog(TestDialog.NO)
        devEnvStatusWatcher.checkHeartbeat(0, 900, projectRule.project)
        verify(devEnvStatusWatcher, times(0)).notifyBackendOfActivity(any())
    }
}
