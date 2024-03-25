// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.feedback

import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentManager
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.ui.feedback.ENABLED_EXPERIMENTS

internal suspend fun sendFeedbackWithExperimentsMetadata(sentiment: Sentiment, comment: String, metadata: Map<String, String> = emptyMap()) {
    val experiments = ToolkitExperimentManager.enabledExperiments().joinToString(",") { it.id }
    TelemetryService.getInstance().sendFeedback(sentiment, comment, metadata + (ENABLED_EXPERIMENTS to experiments))
}
