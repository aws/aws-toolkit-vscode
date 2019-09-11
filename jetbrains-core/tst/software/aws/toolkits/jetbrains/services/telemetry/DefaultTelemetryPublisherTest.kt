// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.amazon.awssdk.services.toolkittelemetry.model.MetadataEntry
import software.amazon.awssdk.services.toolkittelemetry.model.PostMetricsRequest
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.jetbrains.utils.delegateMock

class DefaultTelemetryPublisherTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun testPublish() {
        val mockPostMetircsRequestCaptor = argumentCaptor<PostMetricsRequest>()

        val mockTelemetryClient = delegateMock<ToolkitTelemetryClient>()
        val publisher = DefaultTelemetryPublisher(
            productName = AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS,
            productVersion = "1.0",
            clientId = "foo",
            parentProduct = "JetBrains",
            parentProductVersion = "191",
            client = mockTelemetryClient,
            os = "mac",
            osVersion = "1.0"
        )

        val metricEvent = DefaultMetricEvent.builder("Foo")
            .awsAccount("111111111111")
            .awsRegion("us-west-2")
            .datum("Bar") { this.count() }
            .build()

        publisher.publish(listOf(metricEvent))

        verify(mockTelemetryClient, times(1)).postMetrics(mockPostMetircsRequestCaptor.capture())
        val postMetricsRequest = mockPostMetircsRequestCaptor.firstValue

        assertThat(postMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(postMetricsRequest.awsProductVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.clientID()).isEqualTo("foo")
        assertThat(postMetricsRequest.parentProduct()).isEqualTo("JetBrains")
        assertThat(postMetricsRequest.parentProductVersion()).isEqualTo("191")
        assertThat(postMetricsRequest.os()).isEqualTo("mac")
        assertThat(postMetricsRequest.osVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.metricData()).hasSize(1)

        val metricDatum = postMetricsRequest.metricData()[0]
        assertThat(metricDatum.metricName()).isEqualTo("Foo.Bar")
        assertThat(metricDatum.metadata()).contains(
            MetadataEntry.builder()
                .key("awsAccount")
                .value("111111111111")
                .build(),
            MetadataEntry.builder()
                .key("awsRegion")
                .value("us-west-2")
                .build()
        )
    }
}
