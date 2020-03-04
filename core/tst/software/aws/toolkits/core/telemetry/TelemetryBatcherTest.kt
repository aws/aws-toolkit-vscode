// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verifyBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.ArgumentMatchers.anyCollection
import org.mockito.stubbing.Answer
import software.amazon.awssdk.core.exception.SdkServiceException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TestTelemetryBatcher(publisher: TelemetryPublisher, maxBatchSize: Int, maxQueueSize: Int) :
    DefaultTelemetryBatcher(publisher, maxBatchSize, maxQueueSize) {
    fun eventQueue() = eventQueue
}

class TelemetryBatcherTest {
    private var publisher: TelemetryPublisher = mock()
    private var batcher: TestTelemetryBatcher = TestTelemetryBatcher(publisher, MAX_BATCH_SIZE, MAX_QUEUE_SIZE)

    init {
        batcher.onTelemetryEnabledChanged(true)
    }

    @Test
    fun testSingleBatch() {
        val publishCountDown = CountDownLatch(1)
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            onBlocking { publisher.publish(publishCaptor.capture()) }
                .doAnswer(createPublishAnswer(publishCountDown))
        }

        batcher.enqueue(DefaultMetricEvent.builder().build())
        batcher.flush(false)

        waitForPublish(publishCountDown)

        verifyBlocking(publisher) { publish(anyCollection()) }

        assertThat(publishCaptor.firstValue).hasSize(1)
    }

    @Test
    fun testSplitBatch() {
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        val totalEvents = MAX_BATCH_SIZE + 1
        val events = ArrayList<MetricEvent>()
        repeat(totalEvents) {
            events.add(createEmptyMetricEvent())
        }
        batcher.enqueue(events)
        batcher.flush(false)

        verifyBlocking(publisher, times(2)) { publish(publishCaptor.capture()) }

        assertThat(publishCaptor.allValues).hasSize(2)
        assertThat(publishCaptor.firstValue).hasSize(MAX_BATCH_SIZE)
        assertThat(publishCaptor.secondValue).hasSize(1)
    }

    @Test
    fun testRetryException() {
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            onBlocking { publisher.publish(anyCollection()) }
                .doThrow(RuntimeException("Mock exception"))
        }

        batcher.enqueue(createEmptyMetricEvent())
        batcher.flush(true)

        verifyBlocking(publisher, times(1)) { publish(publishCaptor.capture()) }

        assertThat(publishCaptor.allValues).hasSize(1)
        assertThat(batcher.eventQueue()).hasSize(1)
    }

    @Test
    fun testDontRetry400Exception() {
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            onBlocking { publisher.publish(anyCollection()) }
                .doThrow(SdkServiceException.builder().statusCode(400).build())
                .doAnswer(Answer<Unit> {})
        }

        batcher.enqueue(createEmptyMetricEvent())
        batcher.flush(true)

        verifyBlocking(publisher, times(1)) { publish(publishCaptor.capture()) }

        assertThat(publishCaptor.allValues).hasSize(1)
        assertThat(batcher.eventQueue()).hasSize(0)
    }

    @Test
    fun testDispose() {
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        batcher.enqueue(createEmptyMetricEvent())
        batcher.shutdown()
        batcher.enqueue(createEmptyMetricEvent())
        batcher.shutdown()

        verifyBlocking(publisher) { publish(publishCaptor.capture()) }

        assertThat(publishCaptor.allValues).hasSize(1)
        assertThat(publishCaptor.firstValue.toList()).hasSize(1)
    }

    private fun createEmptyMetricEvent(): MetricEvent = DefaultMetricEvent.builder().build()

    private fun waitForPublish(publishCountDown: CountDownLatch) {
        // Wait for maximum of 5 secs before thread continues, may not reach final count though
        publishCountDown.await(5, TimeUnit.SECONDS)
    }

    private fun createPublishAnswer(publishCountDown: CountDownLatch): Answer<Unit> = Answer {
        publishCountDown.countDown()
    }

    companion object {
        private const val MAX_BATCH_SIZE = 5
        private const val MAX_QUEUE_SIZE = 10
    }
}
