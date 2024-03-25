// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.feedback

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.ApplicationExtension
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.junit5.TestDisposable
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.experiments.DummyExperiment
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperimentManager
import software.aws.toolkits.jetbrains.core.experiments.setState
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.ui.feedback.ENABLED_EXPERIMENTS

@ExtendWith(ApplicationExtension::class)
class SendFeedbackWithExperimentsMetadataTest {
    private class TestTelemetryService(publisher: TelemetryPublisher = NoOpPublisher(), batcher: TelemetryBatcher) : TelemetryService(publisher, batcher)

    @Test
    fun experimentStatusIsIncludedInFeedback(@TestDisposable disposable: Disposable) = runTest {
        val fooExperiment = DummyExperiment()
        val barExperiment = DummyExperiment()
        val bloopExperiment = DummyExperiment()
        ExtensionTestUtil.maskExtensions(ToolkitExperimentManager.EP_NAME, listOf(fooExperiment, barExperiment, bloopExperiment), disposable)

        fooExperiment.setState(true)
        barExperiment.setState(true)

        val publisher = mock<TelemetryPublisher>()
        val telemetryService = TestTelemetryService(publisher = publisher, batcher = mock())
        ApplicationManager.getApplication().replaceService(TelemetryService::class.java, telemetryService, disposable)

        val comment = aString()

        sendFeedbackWithExperimentsMetadata(Sentiment.NEGATIVE, comment)
        Disposer.dispose(telemetryService)

        verify(publisher).sendFeedback(Sentiment.NEGATIVE, comment, mapOf(ENABLED_EXPERIMENTS to "${fooExperiment.id},${barExperiment.id}"))
    }
}
