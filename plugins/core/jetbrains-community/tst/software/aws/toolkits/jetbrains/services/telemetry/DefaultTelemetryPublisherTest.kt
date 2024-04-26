// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.testFramework.ProjectRule
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.amazon.awssdk.services.toolkittelemetry.model.MetadataEntry
import software.amazon.awssdk.services.toolkittelemetry.model.PostFeedbackRequest
import software.amazon.awssdk.services.toolkittelemetry.model.PostMetricsRequest
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.telemetry.DefaultMetricEvent
import software.aws.toolkits.core.utils.delegateMock

class DefaultTelemetryPublisherTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun testPublishWithNamespace() {
        val mockPostMetricsRequestCaptor = argumentCaptor<PostMetricsRequest>()

        val mockTelemetryClient = delegateMock<ToolkitTelemetryClient>()
        val publisher = DefaultTelemetryPublisher(
            clientProvider = { mockTelemetryClient },
            clientMetadataProvider = { product, version -> defaultMetadata }
        )

        runBlocking {
            publisher.publish(
                listOf(
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
                )
            )
        }

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

    @Test
    fun testPublishWithoutNamespace() {
        val mockPostMetricsRequestCaptor = argumentCaptor<PostMetricsRequest>()

        val mockTelemetryClient = delegateMock<ToolkitTelemetryClient>()
        val publisher = DefaultTelemetryPublisher(
            clientProvider = { mockTelemetryClient },
            clientMetadataProvider = { product, version -> defaultMetadata }
        )

        runBlocking {
            publisher.publish(
                listOf(
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
                )
            )
        }

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

    @Test
    fun testPublishMultipleProductsAndVersions() {
        val mockPostMetricsRequestCaptor = argumentCaptor<PostMetricsRequest>()

        val mockTelemetryClient = delegateMock<ToolkitTelemetryClient>()
        val publisher = DefaultTelemetryPublisher(
            clientProvider = { mockTelemetryClient },
            clientMetadataProvider = { product, version -> getClientMetadata(product, version) }
        )

        runBlocking {
            publisher.publish(
                listOf(
                    DefaultMetricEvent.builder()
                        .awsProduct(AWSProduct.AMAZON_Q_FOR_JET_BRAINS)
                        .awsVersion("1.0")
                        .awsAccount("111111111111")
                        .awsRegion("us-west-2")
                        .datum("foobar") { this.count() }
                        .build(),
                    DefaultMetricEvent.builder()
                        .awsProduct(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
                        .awsVersion("2.0")
                        .awsAccount("111111111111")
                        .awsRegion("us-west-2")
                        .datum("spam") { this.count() }
                        .build(),
                    DefaultMetricEvent.builder()
                        .awsProduct(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
                        .awsVersion("2.0")
                        .awsAccount("111111111111")
                        .awsRegion("us-west-2")
                        .datum("baz") { this.count() }
                        .build(),
                    DefaultMetricEvent.builder()
                        .awsProduct(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
                        .awsVersion("3.0")
                        .awsAccount("111111111111")
                        .awsRegion("us-west-2")
                        .datum("random") { this.count() }
                        .build()
                )
            )
        }

        verify(mockTelemetryClient, times(3)).postMetrics(mockPostMetricsRequestCaptor.capture())
        val firstPostMetricsRequest = mockPostMetricsRequestCaptor.firstValue

        assertThat(firstPostMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AMAZON_Q_FOR_JET_BRAINS)
        assertThat(firstPostMetricsRequest.awsProductVersion()).isEqualTo("1.0")
        assertThat(firstPostMetricsRequest.metricData()).hasSize(1)

        val secondPostMetricsRequest = mockPostMetricsRequestCaptor.secondValue
        assertThat(secondPostMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(secondPostMetricsRequest.awsProductVersion()).isEqualTo("2.0")
        assertThat(secondPostMetricsRequest.metricData()).hasSize(2)

        val thirdPostMetricsRequest = mockPostMetricsRequestCaptor.thirdValue
        assertThat(thirdPostMetricsRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(thirdPostMetricsRequest.awsProductVersion()).isEqualTo("3.0")
        assertThat(thirdPostMetricsRequest.metricData()).hasSize(1)
    }

    @Test
    fun testSendFeedback() {
        val mockPostFeedbackRequest = argumentCaptor<PostFeedbackRequest>()

        val mockTelemetryClient = delegateMock<ToolkitTelemetryClient>()
        val publisher = DefaultTelemetryPublisher(
            clientProvider = { mockTelemetryClient },
            clientMetadataProvider = { product, version -> defaultMetadata }
        )

        val metadata = mapOf("foo" to "bar")

        runBlocking {
            publisher.sendFeedback(
                Sentiment.POSITIVE,
                "fooBar",
                metadata
            )
        }

        verify(mockTelemetryClient, times(1)).postFeedback(mockPostFeedbackRequest.capture())
        val postFeedbackRequest = mockPostFeedbackRequest.firstValue

        assertThat(postFeedbackRequest.awsProduct()).isEqualTo(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS)
        assertThat(postFeedbackRequest.awsProductVersion()).isEqualTo("1.0")
        assertThat(postFeedbackRequest.parentProduct()).isEqualTo("JetBrains")
        assertThat(postFeedbackRequest.parentProductVersion()).isEqualTo("191")
        assertThat(postFeedbackRequest.os()).isEqualTo("mac")
        assertThat(postFeedbackRequest.osVersion()).isEqualTo("1.0")
        assertThat(postFeedbackRequest.sentiment()).isEqualTo(Sentiment.POSITIVE)
        assertThat(postFeedbackRequest.comment()).isEqualTo("fooBar")
        assertThat(postFeedbackRequest.metadata()).hasSize(1)
        assertThat(postFeedbackRequest.metadata().get(0).key()).isEqualTo("foo")
        assertThat(postFeedbackRequest.metadata().get(0).value()).isEqualTo("bar")
    }

    private val defaultMetadata = getClientMetadata(AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS, "1.0")

    private fun getClientMetadata(product: AWSProduct, version: String): ClientMetadata =
        ClientMetadata(
            awsProduct = product,
            awsVersion = version,
            clientId = "foo",
            parentProduct = "JetBrains",
            parentProductVersion = "191",
            os = "mac",
            osVersion = "1.0"
        )
}
