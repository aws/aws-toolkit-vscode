// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryServiceTest {
    private class TestTelemetryService(batcher: TelemetryBatcher) : TelemetryService(NoOpPublisher(), batcher)

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @After
    fun tearDown() {
        AwsSettings.getInstance().isTelemetryEnabled = false

        MockProjectAccountSettingsManager.getInstance(projectRule.project).reset()
        MockCredentialsManager.getInstance().reset()
        MockRegionProvider.getInstance().reset()
    }

    @Test
    fun testInitialTelemetrySetting() {
        AwsSettings.getInstance().isTelemetryEnabled = true

        val changeCountDown = CountDownLatch(1)
        val changeCaptor = argumentCaptor<Boolean>()

        val batcher = mock<TelemetryBatcher>()

        batcher.stub {
            on(batcher.onTelemetryEnabledChanged(changeCaptor.capture()))
                .doAnswer {
                    changeCountDown.countDown()
                }
        }

        TestTelemetryService(batcher)

        changeCountDown.await(5, TimeUnit.SECONDS)
        verify(batcher).onTelemetryEnabledChanged(true)
        assertThat(changeCaptor.allValues).hasSize(1)
        assertThat(changeCaptor.firstValue).isEqualTo(true)
    }

    @Test
    fun testTelemetrySettingChanged() {
        AwsSettings.getInstance().isTelemetryEnabled = true

        val changeCountDown = CountDownLatch(3)
        val changeCaptor = argumentCaptor<Boolean>()

        val batcher = mock<TelemetryBatcher>()

        batcher.stub {
            on(batcher.onTelemetryEnabledChanged(changeCaptor.capture()))
                .doAnswer {
                    changeCountDown.countDown()
                }
        }

        val telemetryService = TestTelemetryService(batcher)

        telemetryService.setTelemetryEnabled(false)
        telemetryService.setTelemetryEnabled(true)

        changeCountDown.await(5, TimeUnit.SECONDS)
        verify(batcher, times(2)).onTelemetryEnabledChanged(true)
        verify(batcher).onTelemetryEnabledChanged(false)
        assertThat(changeCaptor.allValues).hasSize(3)
        assertThat(changeCaptor.firstValue).isEqualTo(true)
        assertThat(changeCaptor.secondValue).isEqualTo(false)
        assertThat(changeCaptor.thirdValue).isEqualTo(true)
    }

    @Test
    fun metricEventMetadataIsNotSet() {
        val accountSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)

        accountSettings.changeCredentialProvider(null)

        val eventCaptor = argumentCaptor<MetricEvent>()

        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher)

        telemetryService.record(projectRule.project) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher).enqueue(eventCaptor.capture())

        assertMetricEventsContains(eventCaptor.allValues, "Foo", METADATA_NOT_SET, "us-east-1")
    }

    @Test
    fun metricEventMetadataIsSet() {
        val accountSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)
        MockResourceCache.getInstance(projectRule.project).addValidAwsCredential(accountSettings.activeRegion.id, "profile:admin", "111111111111")

        accountSettings.changeCredentialProvider(
            MockCredentialsManager.getInstance().addCredentials("profile:admin")
        )

        val mockRegion = AwsRegion("foo-region", "foo-region", "aws")
        MockRegionProvider.getInstance().addRegion(mockRegion)
        accountSettings.changeRegion(mockRegion)

        MockResourceCache.getInstance(projectRule.project).addValidAwsCredential("foo-region", "profile:admin", "111111111111")

        val eventCaptor = argumentCaptor<MetricEvent>()
        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher)

        telemetryService.record(projectRule.project) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues, "Foo", "111111111111", "foo-region")
    }

    @Test
    fun metricEventMetadataIsOverridden() {
        val accountSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)
        MockResourceCache.getInstance(projectRule.project).addValidAwsCredential(accountSettings.activeRegion.id, "profile:admin", "111111111111")

        accountSettings.changeCredentialProvider(
            MockCredentialsManager.getInstance().addCredentials("profile:admin")
        )

        val mockRegion = AwsRegion("foo-region", "foo-region", "aws")
        MockRegionProvider.getInstance().addRegion(mockRegion)
        accountSettings.changeRegion(mockRegion)

        val eventCaptor = argumentCaptor<MetricEvent>()

        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher)

        telemetryService.record(
            TelemetryService.MetricEventMetadata(
                awsAccount = "222222222222",
                awsRegion = "bar-region"
            )
        ) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues, "Foo", "222222222222", "bar-region")
    }

    private fun assertMetricEventsContains(events: Collection<MetricEvent>, event: String, awsAccount: String, awsRegion: String) {
        val metricEvent = events.find { e ->
            e.data.find { it.name == event } != null && e.awsAccount == awsAccount && e.awsRegion == awsRegion
        }

        assertThat(metricEvent).isNotNull
    }
}
