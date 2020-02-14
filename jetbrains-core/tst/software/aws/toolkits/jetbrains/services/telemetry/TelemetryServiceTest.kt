// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
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
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NA
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.DefaultTelemetryBatcher
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.settings.MockAwsSettings
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryServiceTest {
    private val batcher = mock<DefaultTelemetryBatcher> {
        on { enqueue(any<MetricEvent>()) }.then {
            mock.enqueue(listOf(it.getArgument<MetricEvent>(0)))
            null
        }
    }

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @After
    fun tearDown() {
        MockProjectAccountSettingsManager.getInstance(projectRule.project).reset()
        MockCredentialsManager.getInstance().reset()
        MockRegionProvider.getInstance().reset()
    }

    @Test
    fun testInitialChangeEvent() {
        val changeCountDown = CountDownLatch(1)
        val changeCaptor = argumentCaptor<Boolean>()
        batcher.stub {
            on(batcher.onTelemetryEnabledChanged(changeCaptor.capture()))
                .doAnswer {
                    changeCountDown.countDown()
                }
        }

        DefaultTelemetryService(
            MockAwsSettings(true, true, UUID.randomUUID())
        ).also {
            it.batcher = batcher
        }

        changeCountDown.await(5, TimeUnit.SECONDS)
        verify(batcher).onTelemetryEnabledChanged(true)
        assertThat(changeCaptor.allValues).hasSize(1)
        assertThat(changeCaptor.firstValue).isEqualTo(true)
    }

    @Test
    fun testTriggeredChangeEvent() {
        val changeCountDown = CountDownLatch(2)
        val changeCaptor = argumentCaptor<Boolean>()
        batcher.stub {
            on(batcher.onTelemetryEnabledChanged(changeCaptor.capture()))
                .doAnswer {
                    changeCountDown.countDown()
                }
        }

        DefaultTelemetryService(
            MockAwsSettings(true, true, UUID.randomUUID())
        ).also {
            it.batcher = batcher
        }

        TelemetryService.syncPublisher().notify(false)

        changeCountDown.await(5, TimeUnit.SECONDS)
        verify(batcher).onTelemetryEnabledChanged(true)
        verify(batcher).onTelemetryEnabledChanged(false)
        assertThat(changeCaptor.allValues).hasSize(2)
        assertThat(changeCaptor.firstValue).isEqualTo(true)
        assertThat(changeCaptor.secondValue).isEqualTo(false)
    }

    @Test
    fun metricEventMetadataIsNotSet() {
        val accountSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)

        accountSettings.changeCredentialProvider(null)

        val eventCaptor = argumentCaptor<Collection<MetricEvent>>()
        val telemetryService = DefaultTelemetryService(
            MockAwsSettings(true, true, UUID.randomUUID())
        ).also {
            it.batcher = batcher
        }

        telemetryService.record(projectRule.project) {
            datum("Foo")
        }.join()
        telemetryService.dispose()

        verify(batcher, times(3)).enqueue(eventCaptor.capture())

        assertMetricEventsContains(eventCaptor.allValues.flatten(), "session_start", METADATA_NA, METADATA_NA)
        assertMetricEventsContains(eventCaptor.allValues.flatten(), "Foo", METADATA_NOT_SET, "us-east-1")
        assertMetricEventsContains(eventCaptor.allValues.flatten(), "session_end", METADATA_NA, METADATA_NA)
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

        val eventCaptor = argumentCaptor<Collection<MetricEvent>>()
        val telemetryService = DefaultTelemetryService(
            MockAwsSettings(true, true, UUID.randomUUID())
        ).also {
            it.batcher = batcher
        }

        telemetryService.record(projectRule.project) {
            datum("Foo")
        }.join()
        telemetryService.dispose()

        verify(batcher, times(3)).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues.flatten(), "Foo", "111111111111", "foo-region")
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

        val eventCaptor = argumentCaptor<Collection<MetricEvent>>()
        val telemetryService = DefaultTelemetryService(
            MockAwsSettings(true, true, UUID.randomUUID())
        ).also {
            it.batcher = batcher
        }

        telemetryService.record(
            TelemetryService.MetricEventMetadata(
                awsAccount = "222222222222",
                awsRegion = "bar-region"
            )
        ) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher, times(3)).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues.flatten(), "Foo", "222222222222", "bar-region")
    }

    private fun assertMetricEventsContains(events: Collection<MetricEvent>, event: String, awsAccount: String, awsRegion: String) {
        val metricEvent = events.find {
            it.data.find { it.name == event } != null && it.awsAccount == awsAccount && it.awsRegion == awsRegion
        }

        assertThat(metricEvent).isNotNull
    }
}
