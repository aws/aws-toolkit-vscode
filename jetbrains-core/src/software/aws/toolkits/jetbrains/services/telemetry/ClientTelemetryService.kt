// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.DefaultProjectFactory
import software.amazon.awssdk.services.toolkittelemetry.ToolkitTelemetryClient
import software.amazon.awssdk.services.toolkittelemetry.model.AWSProduct
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.telemetry.AWSCognitoCredentialsProvider
import software.aws.toolkits.core.telemetry.BatchingMetricsPublisher
import software.aws.toolkits.core.telemetry.ClientTelemetryPublisher
import software.aws.toolkits.core.telemetry.MetricsPublisher
import software.aws.toolkits.core.telemetry.MetricUnit
import software.aws.toolkits.core.telemetry.NoOpMetricsPublisher
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.net.URI
import java.time.Duration
import java.time.Instant

interface ClientTelemetryService : Disposable

class DefaultClientTelemetryService(sdkClient: AwsSdkClient, regionProvider: ToolkitRegionProvider) : ClientTelemetryService {
    private lateinit var startupTime: Instant
    private val publisher: MetricsPublisher

    init {
        Disposer.register(ApplicationManager.getApplication(), sdkClient)

        val clientManager = ServiceManager.getService(
                DefaultProjectFactory.getInstance().defaultProject,
                ToolkitClientManager::class.java
        )

        val settings = AwsSettings.getInstance()
        publisher = if (settings.isTelemetryEnabled) {
            BatchingMetricsPublisher(ClientTelemetryPublisher(
                    AWSProduct.AWS_TOOLKIT_FOR_JET_BRAINS,
                    AwsToolkit.PLUGIN_VERSION,
                    settings.clientId.toString(),
                    ApplicationNamesInfo.getInstance().fullProductNameWithEdition,
                    ApplicationInfo.getInstance().fullVersion,
                    ToolkitTelemetryClient
                            .builder()
                            .endpointOverride(URI.create("https://client-telemetry.us-east-1.amazonaws.com"))
                            // TODO: Determine why this client is not picked up by default.
                            .httpClient(sdkClient.sdkHttpClient)
                            .credentialsProvider(AWSCognitoCredentialsProvider(
                                    "us-east-1:820fd6d1-95c0-4ca4-bffb-3f01d32da842",
                                    clientManager,
                                    regionProvider
                            ))
                            .build()
            ))
        } else {
            NoOpMetricsPublisher()
        }

        publisher.newMetric("ToolkitStart").use {
            startupTime = it.createTime
            // Metadata must be attached to a metric entry. There are not metric data points that we need to log for
            // this event, so we log a placeholder entry with the relevant metadata.
            it.addMetricEntry("metadata") {
                value(0.0)
                unit(MetricUnit.COUNT)
                // TODO
                // val isFirstRun: boolean = ...
                // metadata("isFirstRun", isFirstRun.toString())
            }
        }
    }

    override fun dispose() {
        try {
            publisher.newMetric("ToolkitEnd").use {
                it.addMetricEntry("duration") {
                    value(Duration.between(startupTime, it.createTime).toMillis().toDouble())
                    unit(MetricUnit.MILLISECONDS)
                }
            }
        } finally {
            publisher.shutdown()
        }
    }
}
