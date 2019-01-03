// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.application.ApplicationManager
import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.amazon.awssdk.services.toolkittelemetry.model.MetadataEntry
import software.amazon.awssdk.services.toolkittelemetry.model.MetricDatum
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.amazon.awssdk.services.toolkittelemetry.model.Unit as MetricUnit
import software.aws.toolkits.core.utils.getLogger
import kotlin.streams.toList

class DefaultTelemetryPublisher(
    private val productName: AWSProduct,
    private val productVersion: String,
    private val clientId: String,
    private val parentProduct: String,
    private val parentProductVersion: String,
    private val client: ToolkitTelemetryClient,
    private val os: String,
    private val osVersion: String
) : TelemetryPublisher {
    override fun publish(metricEvents: Collection<MetricEvent>): Boolean = ApplicationManager.getApplication().executeOnPooledThread<Boolean> {
        try {
            client.postMetrics {
                it.awsProduct(productName)
                it.awsProductVersion(productVersion)
                it.clientID(clientId)
                it.os(os)
                it.osVersion(osVersion)
                it.parentProduct(parentProduct)
                it.parentProductVersion(parentProductVersion)
                it.metricData(metricEvents.toMetricData())
            }
            true
        } catch (e: Exception) {
            LOG.warn("Failed to publish metrics", e)
            false
        }
    }.get()

    private fun Collection<MetricEvent>.toMetricData(): Collection<MetricDatum> = this
        .flatMap { metricEvent ->
            metricEvent.data.map { datum ->
                MetricDatum.builder()
                    .epochTimestamp(metricEvent.createTime.toEpochMilli())
                    .metricName("${metricEvent.namespace}.${datum.name}")
                    .unit(datum.unit)
                    .value(datum.value)
                    .metadata(datum.metadata.entries.stream().map {
                        MetadataEntry.builder()
                            .key(it.key)
                            .value(it.value)
                            .build()
                    }.toList())
                    .build()
            }.ifEmpty {
                listOf(
                    MetricDatum.builder()
                        .epochTimestamp(metricEvent.createTime.toEpochMilli())
                        .metricName(metricEvent.namespace)
                        .unit(MetricUnit.NONE)
                        .value(0.0)
                        .build()
                )
            }
        }

    private companion object {
        private val LOG = getLogger<DefaultTelemetryPublisher>()
    }
}
