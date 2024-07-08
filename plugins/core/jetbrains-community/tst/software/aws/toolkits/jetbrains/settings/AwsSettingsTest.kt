// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.inOrder
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.services.telemetry.NoOpPublisher
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService

class AwsSettingsTest {
    private class TestTelemetryService(
        publisher: TelemetryPublisher = NoOpPublisher(),
        batcher: TelemetryBatcher
    ) : TelemetryService(publisher, batcher)

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var telemetryService: TelemetryService
    private lateinit var batcher: TelemetryBatcher
    private lateinit var awsSettings: DefaultAwsSettings
    private lateinit var awsConfiguration: AwsConfiguration

    @BeforeEach
    fun setup() {
        batcher = mock()
        telemetryService = spy(TestTelemetryService(batcher = batcher))
        awsSettings = spy(DefaultAwsSettings())
        awsConfiguration = spy(AwsConfiguration())
        awsSettings.loadState(awsConfiguration)
        ApplicationManager.getApplication().replaceService(TelemetryService::class.java, telemetryService, disposableRule.disposable)
        ApplicationManager.getApplication().replaceService(AwsSettings::class.java, awsSettings, disposableRule.disposable)
    }

    @Test
    fun `telemetry event batched before setting isTelemetryEnabled to false`() {
        verifyTelemetryEventOrder(false)
    }

    @Test
    fun `telemetry event batched before setting isTelemetryEnabled to true`() {
        verifyTelemetryEventOrder(true)
    }

    private fun verifyTelemetryEventOrder(value: Boolean) {
        val inOrder = inOrder(telemetryService, batcher, awsConfiguration)
        val changeCaptor = argumentCaptor<Boolean>()
        val onChangeEventCaptor = argumentCaptor<(Boolean) -> Unit>()

        AwsSettings.getInstance().isTelemetryEnabled = value

        inOrder.verify(telemetryService).setTelemetryEnabled(changeCaptor.capture(), onChangeEventCaptor.capture())
        assertThat(changeCaptor.firstValue).isEqualTo(value)
        inOrder.verify(batcher).onTelemetryEnabledChanged(value, onChangeEventCaptor.firstValue)
        inOrder.verify(awsConfiguration).isTelemetryEnabled = value
    }
}
