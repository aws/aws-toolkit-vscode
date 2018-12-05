// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import assertk.assert
import assertk.assertions.hasSize
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.doThrow
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.junit.Test
import org.mockito.ArgumentMatchers.anyCollection
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.stubbing.Answer
import java.util.ArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class BatchingMetricsPublisherTest {
    private var downstreamPublisher: MetricsPublisher = mock()

    private var batchingMetricsPublisher = BatchingMetricsPublisher(
        downstreamPublisher,
        10,
        TimeUnit.MILLISECONDS,
        MAX_BATCH_SIZE
    )

    @Test
    fun testSingleBatch() {
        val publishCount = CountDownLatch(1)

        val recordEventsCaptor = argumentCaptor<Collection<Metric>>()

        downstreamPublisher.stub {
            on(downstreamPublisher.publishMetrics(recordEventsCaptor.capture()))
                .doAnswer(createPublishAnswer(publishCount, true))
        }

        batchingMetricsPublisher.newMetric(EVENT_NAME).close()

        waitForPublish(publishCount)

        verify(downstreamPublisher).publishMetrics(anyCollection<Metric>())

        assert(recordEventsCaptor.firstValue).hasSize(1)
    }

    @Test
    fun testSplitBatch() {
        // Will publish in 2 batches
        val publishCount = CountDownLatch(2)

        val recordEventsCaptor = argumentCaptor<Collection<Metric>>()

        downstreamPublisher.stub {
            on(downstreamPublisher.publishMetrics(recordEventsCaptor.capture()))
                .doAnswer(createPublishAnswer(publishCount, true))
        }

        val totalEvents = MAX_BATCH_SIZE + 1
        val events = ArrayList<Metric>(totalEvents)
        for (i in 0 until totalEvents) {
            events.add(batchingMetricsPublisher.newMetric(EVENT_NAME))
        }
        batchingMetricsPublisher.publishMetrics(events)

        waitForPublish(publishCount)

        verify(downstreamPublisher, times(2)).publishMetrics(anyCollection<Metric>())

        assert(recordEventsCaptor.allValues).hasSize(2)
        assert(recordEventsCaptor.allValues[0]).hasSize(MAX_BATCH_SIZE)
        assert(recordEventsCaptor.allValues[1]).hasSize(totalEvents - MAX_BATCH_SIZE)
    }

    @Test
    fun testRetry() {
        val publishCount = CountDownLatch(2)

        val recordEventsCaptor = argumentCaptor<Collection<Metric>>()

        downstreamPublisher.stub {
            on(downstreamPublisher.publishMetrics(recordEventsCaptor.capture()))
                .doAnswer(createPublishAnswer(publishCount, false))
                .doAnswer(createPublishAnswer(publishCount, true))
        }

        batchingMetricsPublisher.newMetric(EVENT_NAME).close()

        waitForPublish(publishCount)

        verify(downstreamPublisher, times(2)).publishMetrics(anyCollection<Metric>())

        assert(recordEventsCaptor.allValues).hasSize(2)
        assert(recordEventsCaptor.allValues[0]).hasSize(1)
        assert(recordEventsCaptor.allValues[1]).hasSize(1)
    }

    @Test
    fun testRetryException() {
        val publishCount = CountDownLatch(1)

        val recordEventsCaptor = argumentCaptor<Collection<Metric>>()

        downstreamPublisher.stub {
            on(downstreamPublisher.publishMetrics(recordEventsCaptor.capture()))
                .doThrow(RuntimeException("Mock exception"))
                .doAnswer(createPublishAnswer(publishCount, true))
        }

        batchingMetricsPublisher.newMetric(EVENT_NAME).close()

        waitForPublish(publishCount)

        verify(downstreamPublisher, times(2)).publishMetrics(anyCollection<Metric>())

        assert(recordEventsCaptor.allValues).hasSize(2)
        assert(recordEventsCaptor.allValues[0]).hasSize(1)
        assert(recordEventsCaptor.allValues[1]).hasSize(1)
    }

    @Test
    fun testShutdown() {
        val recordEventsCaptor = argumentCaptor<Collection<Metric>>()

        downstreamPublisher.stub {
            on(downstreamPublisher.publishMetrics(recordEventsCaptor.capture()))
                .doReturn(true)
        }

        batchingMetricsPublisher.newMetric(EVENT_NAME).close()
        batchingMetricsPublisher.shutdown()
        // This will get ignored since we marked shutdown to begin
        batchingMetricsPublisher.newMetric(EVENT_NAME).close()
        batchingMetricsPublisher.shutdown()

        verify(downstreamPublisher).publishMetrics(anyCollection<Metric>())

        assert(recordEventsCaptor.allValues).hasSize(1)
        assert(recordEventsCaptor.firstValue).hasSize(1)
    }

    private fun waitForPublish(publishCount: CountDownLatch) {
        // Wait for maximum of 5 secs before thread continues, may not reach final count though
        publishCount.await(5, TimeUnit.SECONDS)
    }

    private fun createPublishAnswer(publishCount: CountDownLatch, value: Boolean): Answer<Boolean> = Answer {
        publishCount.countDown()
        value
    }

    companion object {
        private const val EVENT_NAME = "Event"
        private const val MAX_BATCH_SIZE = 5
    }
}