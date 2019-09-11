// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.ArgumentMatchers.anyCollection
import org.mockito.stubbing.Answer
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
            on(publisher.publish(publishCaptor.capture()))
                .doAnswer(createPublishAnswer(publishCountDown, true))
        }

        batcher.enqueue(DefaultMetricEvent.builder(EVENT_NAME)
                .build()
        )
        batcher.flush(false)

        waitForPublish(publishCountDown)

        verify(publisher).publish(anyCollection())

        assertThat(publishCaptor.firstValue).hasSize(1)
    }

    @Test
    fun testSplitBatch() {
        val publishCountDown = CountDownLatch(2)
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            on(publisher.publish(publishCaptor.capture()))
                    .doAnswer(createPublishAnswer(publishCountDown, true))
        }

        val totalEvents = MAX_BATCH_SIZE + 1
        val events = ArrayList<MetricEvent>()
        for (i in 0 until totalEvents) {
            events.add(createEmptyMetricEvent())
        }
        batcher.enqueue(events)
        batcher.flush(false)

        waitForPublish(publishCountDown)

        verify(publisher, times(2)).publish(anyCollection())

        assertThat(publishCaptor.allValues).hasSize(2)
        assertThat(publishCaptor.allValues[0]).hasSize(MAX_BATCH_SIZE)
        assertThat(publishCaptor.allValues[1]).hasSize(1)
    }

    @Test
    fun testRetry() {
        val publishCountDown = CountDownLatch(2)
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            on(publisher.publish(publishCaptor.capture()))
                    .doAnswer(createPublishAnswer(publishCountDown, false))
                    .doAnswer(createPublishAnswer(publishCountDown, true))
        }

        batcher.enqueue(createEmptyMetricEvent())
        batcher.flush(true)

        verify(publisher, times(1)).publish(anyCollection())

        assertThat(publishCaptor.allValues).hasSize(1)
        assertThat(batcher.eventQueue()).hasSize(1)
    }

    @Test
    fun testRetryException() {
        val publishCountDown = CountDownLatch(1)
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            on(publisher.publish(publishCaptor.capture()))
                    .doThrow(RuntimeException("Mock exception"))
                    .doAnswer(createPublishAnswer(publishCountDown, true))
        }

        batcher.enqueue(createEmptyMetricEvent())
        batcher.flush(true)

        waitForPublish(publishCountDown)

        verify(publisher, times(1)).publish(anyCollection())

        assertThat(publishCaptor.allValues).hasSize(1)
        assertThat(batcher.eventQueue()).hasSize(1)
    }

    @Test
    fun testDispose() {
        val publishCaptor = argumentCaptor<Collection<MetricEvent>>()

        publisher.stub {
            on(publisher.publish(publishCaptor.capture()))
                    .doReturn(true)
        }

        batcher.enqueue(createEmptyMetricEvent())
        batcher.shutdown()
        batcher.enqueue(createEmptyMetricEvent())
        batcher.shutdown()

        verify(publisher).publish(anyCollection())

        assertThat(publishCaptor.allValues).hasSize(1)
        assertThat(publishCaptor.firstValue.toList()).hasSize(1)
    }

    private fun createEmptyMetricEvent(): MetricEvent = DefaultMetricEvent.builder(EVENT_NAME).build()

    private fun waitForPublish(publishCountDown: CountDownLatch) {
        // Wait for maximum of 5 secs before thread continues, may not reach final count though
        publishCountDown.await(5, TimeUnit.SECONDS)
    }

    private fun createPublishAnswer(publishCountDown: CountDownLatch, value: Boolean): Answer<Boolean> = Answer {
        publishCountDown.countDown()
        value
    }

    companion object {
        private const val EVENT_NAME = "Event"
        private const val MAX_BATCH_SIZE = 5
        private const val MAX_QUEUE_SIZE = 10
    }
}
