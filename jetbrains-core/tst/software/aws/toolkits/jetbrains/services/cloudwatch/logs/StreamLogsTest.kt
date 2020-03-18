// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.debug.junit4.CoroutinesTimeout
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.TailLogs

class StreamLogsTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val timeout = CoroutinesTimeout.seconds(10)

    @Test
    fun streamsWhenEnabled() {
        val channel = Channel<LogStreamActor.Messages>()
        val tailLogs = TailLogs(channel)
        runBlocking {
            withTimeout(1500) {
                tailLogs.setSelected(TestActionEvent(), true)
                var response = channel.receive()
                assertThat(response).isEqualTo(LogStreamActor.Messages.LOAD_FORWARD)
                response = channel.receive()
                assertThat(response).isEqualTo(LogStreamActor.Messages.LOAD_FORWARD)
            }
        }
    }

    @Test
    fun cancelsOnChannelClose() {
        val channel = Channel<LogStreamActor.Messages>()
        val tailLogs = TailLogs(channel)
        channel.close()
        tailLogs.setSelected(TestActionEvent(), true)
        runBlocking {
            while (tailLogs.logStreamingJob?.isCompleted != true) {
                delay(10)
                println(tailLogs.logStreamingJob?.isActive)
            }
        }
        assertThat(tailLogs.logStreamingJob?.isActive).isFalse()
    }

    @Test
    fun cancelsOnCancel() {
        val channel = Channel<LogStreamActor.Messages>()
        val tailLogs = TailLogs(channel)
        tailLogs.setSelected(TestActionEvent(), true)
        assertThat(tailLogs.logStreamingJob?.isActive).isTrue()
        tailLogs.setSelected(TestActionEvent(), false)
        runBlocking {
            while (tailLogs.logStreamingJob?.isCompleted != true) {
                delay(10)
            }
        }
        assertThat(tailLogs.logStreamingJob?.isActive).isFalse()
    }
}
