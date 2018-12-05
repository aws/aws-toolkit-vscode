// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import software.aws.toolkits.core.utils.getLogger
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Creates new [Metric] objects.
 */
interface MetricsFactory {
    /**
     * Creates a new metric with the specified name
     *
     * @param metricNamespace The namespace the metric will be published under
     * @return The new metric
     */
    fun newMetric(metricNamespace: String): Metric
}

/**
 * Publishes metrics to a backing telemetry platform
 */
interface MetricsPublisher : MetricsFactory {
    /**
     * Publish the event to the backing telemetry platform
     *
     * @param metric The event to publish
     * @return true if successfully published, else false
     */
    fun publishMetric(metric: Metric): Boolean = publishMetrics(Collections.singleton(metric))

    /**
     * Records the collection of events to the backing analytics platform
     *
     * @param metrics The events to publish
     * @return true if successfully published, else false
     */
    fun publishMetrics(metrics: Collection<Metric>): Boolean

    /**
     * Shutdown the publisher. May flush any pending events before finishing (best effort).
     */
    fun shutdown()

    override fun newMetric(metricNamespace: String): Metric = Metric(metricNamespace, this)
}

class NoOpMetricsPublisher : MetricsPublisher {
    override fun publishMetrics(metrics: Collection<Metric>): Boolean = true

    override fun shutdown() {}
}

/**
 * Implementation of [MetricsPublisher] that batches up events into a minimum batch size before publishing or time
 * elapsed, whichever is sooner
 */
class BatchingMetricsPublisher(
    private val delegate: MetricsPublisher,
    publishInterval: Long = DEFAULT_PUBLISH_INTERVAL,
    publishUnit: TimeUnit = DEFAULT_PUBLISH_UNIT,
    private val maxBatchSize: Int = MAX_BATCH_SIZE,
    private val executorService: ScheduledExecutorService = createDefaultExecutor()
) : MetricsPublisher {

    private val metricQueue = LinkedBlockingDeque<Metric>(MAX_QUEUE_SIZE)
    private val isShuttingDown = AtomicBoolean(false)

    init {
        executorService.scheduleWithFixedDelay(PublishActivity(), publishInterval, publishInterval, publishUnit)
    }

    override fun publishMetrics(metrics: Collection<Metric>): Boolean {
        if (isShuttingDown.get()) {
            LOG.warn("Attempting to publish metrics post-shutdown", Throwable())
            return false
        }

        return try {
            metricQueue.addAll(metrics)
            true
        } catch (e: Exception) {
            LOG.warn("Failed to add metric to queue", e)
            false
        }
    }

    override fun shutdown() {
        if (!isShuttingDown.compareAndSet(false, true)) {
            return
        }

        executorService.shutdown()

        while (metricQueue.size > 0) {
            publishMetrics(false)
        }

        delegate.shutdown()
    }

    @Synchronized
    private fun publishMetrics(retry: Boolean) {
        val batch = mutableListOf<Metric>()
        for (i in 0 until maxBatchSize) {
            val event = metricQueue.poll() ?: break
            batch.add(event)
        }

        val submittedSuccessfully = try {
            delegate.publishMetrics(batch)
        } catch (e: Exception) {
            LOG.warn("Downstream publish threw exception", e)
            false
        }

        if (!submittedSuccessfully && retry) {
            LOG.warn("Downstream publish failed, will retry")
            for (i in batch.indices.reversed()) {
                metricQueue.push(batch[i])
            }
        }
    }

    private inner class PublishActivity : Runnable {
        override fun run() {
            // Let shutdown() handle the draining
            if (isShuttingDown.get()) {
                return
            }

            if (metricQueue.isEmpty()) {
                return
            }

            try {
                publishMetrics(true)
            } catch (e: Exception) {
                LOG.warn("Publish system threw unexpected exception", e)
            }
        }
    }

    companion object {
        private val LOG = getLogger<BatchingMetricsPublisher>()
        private const val MAX_QUEUE_SIZE = 10_000
        private const val MAX_BATCH_SIZE = 20
        private const val DEFAULT_PUBLISH_INTERVAL = 5L
        private val DEFAULT_PUBLISH_UNIT = TimeUnit.MINUTES

        private fun createDefaultExecutor() = Executors.newSingleThreadScheduledExecutor {
            val daemonThread = Thread(it)
            daemonThread.isDaemon = true
            daemonThread.name = "AWS-Toolkit-Metrics-Publisher"
            daemonThread
        }
    }
}