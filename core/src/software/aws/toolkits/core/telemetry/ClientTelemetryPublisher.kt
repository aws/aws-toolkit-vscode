// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.telemetry

import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.amazon.awssdk.services.toolkittelemetry.model.MetadataEntry
import software.amazon.awssdk.services.toolkittelemetry.model.MetricDatum
import software.amazon.awssdk.services.toolkittelemetry.model.Unit
import software.aws.toolkits.core.utils.getLogger
import kotlin.streams.toList

class ClientTelemetryPublisher(
    private val productName: AWSProduct,
    private val productVersion: String,
    private val clientId: String,
    private val parentProduct: String,
    private val parentProductVersion: String,
    private val client: ToolkitTelemetryClient
) : MetricsPublisher {
    // OS and OS version are not IDE-dependent, so we can determine them here rather than
    // passing them to the constructor.
    private val os: String = System.getProperty("os.name")
    private val osVersion: String = System.getProperty("os.version")

    override fun publishMetrics(metrics: Collection<Metric>): Boolean = try {

        client.postMetrics {
            it.awsProduct(productName)
            it.awsProductVersion(productVersion)
            it.clientID(clientId)
            it.os(os)
            it.osVersion(osVersion)
            it.parentProduct(parentProduct)
            it.parentProductVersion(parentProductVersion)
            it.metricData(metrics.toMetricData())
        }
        true
    } catch (e: Exception) {
        LOG.warn("Failed to publish metrics", e)
        false
    }

    override fun shutdown() { }

    private fun Collection<Metric>.toMetricData(): Collection<MetricDatum> = this.stream()
        .flatMap { metric ->
            metric.entries.entries.stream().map { entry -> MetricDatum.builder()
                    .epochTimestamp(metric.createTime.toEpochMilli())
                    .metricName("${metric.metricNamespace}.${entry.key}")
                    .unit(entry.value.unit.toSdkUnit())
                    .value(entry.value.value)
                    .metadata(entry.value.metadata.entries.stream().map {
                        MetadataEntry.builder()
                                .key(it.key)
                                .value(it.value)
                                .build()
                    }.toList())
                    .build()
            }
        }
        .toList()

    private fun MetricUnit.toSdkUnit(): Unit = when (this) {
        MetricUnit.BYTES -> Unit.BYTES
        MetricUnit.COUNT -> Unit.COUNT
        MetricUnit.MILLISECONDS -> Unit.MILLISECONDS
        MetricUnit.PERCENT -> Unit.PERCENT
    }

    private companion object {
        private val LOG = getLogger<ClientTelemetryPublisher>()
    }
}
