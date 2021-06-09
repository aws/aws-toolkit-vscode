// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.cognitoidentity.CognitoIdentityClient
import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.MetadataEntry
import software.amazon.awssdk.services.toolkittelemetry.model.MetricDatum
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import kotlin.streams.toList

class DefaultTelemetryPublisher(
    private val clientMetadata: ClientMetadata = ClientMetadata.DEFAULT_METADATA,
    private val client: ToolkitTelemetryClient = createDefaultTelemetryClient()
) : TelemetryPublisher {
    override suspend fun publish(metricEvents: Collection<MetricEvent>) {
        withContext(Dispatchers.IO) {
            client.postMetrics {
                it.awsProduct(clientMetadata.productName)
                it.awsProductVersion(clientMetadata.productVersion)
                it.clientID(clientMetadata.clientId)
                it.os(clientMetadata.os)
                it.osVersion(clientMetadata.osVersion)
                it.parentProduct(clientMetadata.parentProduct)
                it.parentProductVersion(clientMetadata.parentProductVersion)
                it.metricData(metricEvents.toMetricData())
            }
        }
    }

    override suspend fun sendFeedback(sentiment: Sentiment, comment: String) {
        withContext(Dispatchers.IO) {
            client.postFeedback {
                it.awsProduct(clientMetadata.productName)
                it.awsProductVersion(clientMetadata.productVersion)
                it.os(clientMetadata.os)
                it.osVersion(clientMetadata.osVersion)
                it.parentProduct(clientMetadata.parentProduct)
                it.parentProductVersion(clientMetadata.parentProductVersion)
                it.sentiment(sentiment)
                it.comment(comment)
            }
        }
    }

    private fun Collection<MetricEvent>.toMetricData(): Collection<MetricDatum> = this
        .flatMap { metricEvent ->
            metricEvent.data.map { datum ->
                val metricName = datum.name
                MetricDatum.builder()
                    .epochTimestamp(metricEvent.createTime.toEpochMilli())
                    .metricName(metricName)
                    .unit(datum.unit)
                    .value(datum.value)
                    .passive(datum.passive)
                    .metadata(
                        datum.metadata.entries.stream().map {
                            MetadataEntry.builder()
                                .key(it.key)
                                .value(it.value)
                                .build()
                        }.toList() + listOf(
                            MetadataEntry.builder()
                                .key(METADATA_AWS_ACCOUNT)
                                .value(metricEvent.awsAccount)
                                .build(),
                            MetadataEntry.builder()
                                .key(METADATA_AWS_REGION)
                                .value(metricEvent.awsRegion)
                                .build()
                        )
                    )
                    .build()
            }
        }

    private companion object {
        private const val METADATA_AWS_ACCOUNT = "awsAccount"
        private const val METADATA_AWS_REGION = "awsRegion"

        private fun createDefaultTelemetryClient(): ToolkitTelemetryClient {
            val sdkClient = AwsSdkClient.getInstance()
            return ToolkitClientManager.createNewClient(
                ToolkitTelemetryClient::class,
                sdkClient.sharedSdkClient(),
                Region.US_EAST_1,
                AWSCognitoCredentialsProvider(
                    "us-east-1:a4c5f960-2eff-4478-aed8-c70f6a2bb5d5",
                    CognitoIdentityClient.builder()
                        .credentialsProvider(AnonymousCredentialsProvider.create())
                        .region(Region.US_EAST_1)
                        .httpClient(sdkClient.sharedSdkClient())
                        .build()
                ),
                endpointOverride = "https://cjlp7jicpe.execute-api.us-east-1.amazonaws.com/Dev"
            )
        }
    }
}
