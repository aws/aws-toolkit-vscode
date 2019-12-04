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
    fun testPublish_withNamespace() {
        val mockPostMetricsRequestCaptor = argumentCaptor<PostMetricsRequest>()

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

        publisher.publish(listOf(
            DefaultMetricEvent.builder("Foo")
                .awsAccount("111111111111")
                .awsRegion("us-west-2")
                .datum("foobar") { this.count() }
                .build(),
            DefaultMetricEvent.builder("Bar")
                .awsAccount("111111111111")
                .awsRegion("us-west-2")
                .datum("spam") { this.count() }
                .build()
        ))

        verify(mockTelemetryClient, times(1)).postMetrics(mockPostMetricsRequestCaptor.capture())
        val postMetricsRequest = mockPostMetricsRequestCaptor.firstValue

        assertThat(postMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(postMetricsRequest.awsProductVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.clientID()).isEqualTo("foo")
        assertThat(postMetricsRequest.parentProduct()).isEqualTo("JetBrains")
        assertThat(postMetricsRequest.parentProductVersion()).isEqualTo("191")
        assertThat(postMetricsRequest.os()).isEqualTo("mac")
        assertThat(postMetricsRequest.osVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.metricData()).hasSize(2)

        postMetricsRequest.metricData()[0].let {
            assertThat(it.metricName()).isEqualTo("Foo.foobar")
            assertThat(it.metadata()).contains(
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

        postMetricsRequest.metricData()[1].let {
            assertThat(it.metricName()).isEqualTo("Bar.spam")
            assertThat(it.metadata()).contains(
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

    @Test
    fun testPublish_withNamespace_withoutDatum() {
        val mockPostMetricsRequestCaptor = argumentCaptor<PostMetricsRequest>()

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

        publisher.publish(listOf(
            DefaultMetricEvent.builder("Foo")
                .awsAccount("111111111111")
                .awsRegion("us-west-2")
                .build(),
            DefaultMetricEvent.builder("Bar")
                .awsAccount("111111111111")
                .awsRegion("us-west-2")
                .build()
        ))

        verify(mockTelemetryClient, times(1)).postMetrics(mockPostMetricsRequestCaptor.capture())
        val postMetricsRequest = mockPostMetricsRequestCaptor.firstValue

        assertThat(postMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(postMetricsRequest.awsProductVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.clientID()).isEqualTo("foo")
        assertThat(postMetricsRequest.parentProduct()).isEqualTo("JetBrains")
        assertThat(postMetricsRequest.parentProductVersion()).isEqualTo("191")
        assertThat(postMetricsRequest.os()).isEqualTo("mac")
        assertThat(postMetricsRequest.osVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.metricData()).hasSize(2)

        postMetricsRequest.metricData()[0].let {
            assertThat(it.metricName()).isEqualTo("Foo")
            assertThat(it.metadata()).contains(
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

        postMetricsRequest.metricData()[1].let {
            assertThat(it.metricName()).isEqualTo("Bar")
            assertThat(it.metadata()).contains(
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

    @Test
    fun testPublish_withoutNamespace() {
        val mockPostMetricsRequestCaptor = argumentCaptor<PostMetricsRequest>()

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

        publisher.publish(listOf(
            DefaultMetricEvent.builder()
                .awsAccount("111111111111")
                .awsRegion("us-west-2")
                .datum("foobar") { this.count() }
                .build(),
            DefaultMetricEvent.builder()
                .awsAccount("111111111111")
                .awsRegion("us-west-2")
                .datum("spam") { this.count() }
                .build()
        ))

        verify(mockTelemetryClient, times(1)).postMetrics(mockPostMetricsRequestCaptor.capture())
        val postMetricsRequest = mockPostMetricsRequestCaptor.firstValue

        assertThat(postMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(postMetricsRequest.awsProductVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.clientID()).isEqualTo("foo")
        assertThat(postMetricsRequest.parentProduct()).isEqualTo("JetBrains")
        assertThat(postMetricsRequest.parentProductVersion()).isEqualTo("191")
        assertThat(postMetricsRequest.os()).isEqualTo("mac")
        assertThat(postMetricsRequest.osVersion()).isEqualTo("1.0")
        assertThat(postMetricsRequest.metricData()).hasSize(2)

        postMetricsRequest.metricData()[0].let {
            assertThat(it.metricName()).isEqualTo("foobar")
            assertThat(it.metadata()).contains(
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

        postMetricsRequest.metricData()[1].let {
            assertThat(it.metricName()).isEqualTo("spam")
            assertThat(it.metadata()).contains(
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
}
