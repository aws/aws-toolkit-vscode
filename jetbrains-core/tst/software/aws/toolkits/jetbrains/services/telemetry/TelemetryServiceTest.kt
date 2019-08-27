// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.testFramework.ProjectRule
import com.intellij.util.messages.MessageBus
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
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NA
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.settings.MockAwsSettings
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryServiceTest {
    private val batcher: TelemetryBatcher = mock()
    private val messageBusService: MessageBusService = MockMessageBusService()

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
                messageBusService,
                MockAwsSettings(true, true, UUID.randomUUID()),
                batcher
        )

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
                messageBusService,
                MockAwsSettings(true, true, UUID.randomUUID()),
                batcher
        )

        val messageBus: MessageBus = messageBusService.messageBus
        val messageBusPublisher: TelemetryEnabledChangedNotifier =
                messageBus.syncPublisher(messageBusService.telemetryEnabledTopic)
        messageBusPublisher.notify(false)

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

        val eventCaptor = argumentCaptor<MetricEvent>()
        val telemetryService = DefaultTelemetryService(
            messageBusService,
            MockAwsSettings(true, true, UUID.randomUUID()),
            batcher
        )

        telemetryService.record(projectRule.project, "Foo").join()
        telemetryService.dispose()

        verify(batcher, times(3)).enqueue(eventCaptor.capture())

        assertMetricEventsContains(eventCaptor.allValues, "ToolkitStart", METADATA_NA, METADATA_NA)
        assertMetricEventsContains(eventCaptor.allValues, "Foo", METADATA_NOT_SET, "us-east-1")
        assertMetricEventsContains(eventCaptor.allValues, "ToolkitEnd", METADATA_NA, METADATA_NA)
    }

    @Test
    fun metricEventMetadataIsSet() {
        val accountSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)
        MockResourceCache.getInstance(projectRule.project).addValidAwsCredential(accountSettings.activeRegion.id, "profile:admin", "111111111111")

        accountSettings.changeCredentialProvider(
            MockCredentialsManager.getInstance().addCredentials("profile:admin", AwsBasicCredentials.create("Access", "Secret"))
        )

        val mockRegion = AwsRegion("foo-region", "foo-region")
        MockRegionProvider.getInstance().addRegion(mockRegion)
        accountSettings.changeRegion(mockRegion)

        MockResourceCache.getInstance(projectRule.project).addValidAwsCredential("foo-region", "profile:admin", "111111111111")

        val eventCaptor = argumentCaptor<MetricEvent>()
        val telemetryService = DefaultTelemetryService(
            messageBusService,
            MockAwsSettings(true, true, UUID.randomUUID()),
            batcher
        )

        telemetryService.record(projectRule.project, "Foo").join()
        telemetryService.dispose()

        verify(batcher, times(3)).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues, "Foo", "111111111111", "foo-region")
    }

    @Test
    fun metricEventMetadataIsOverridden() {
        val accountSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)
        MockResourceCache.getInstance(projectRule.project).addValidAwsCredential(accountSettings.activeRegion.id, "profile:admin", "111111111111")

        accountSettings.changeCredentialProvider(
            MockCredentialsManager.getInstance().addCredentials("profile:admin", AwsBasicCredentials.create("Access", "Secret"))
        )

        val mockRegion = AwsRegion("foo-region", "foo-region")
        MockRegionProvider.getInstance().addRegion(mockRegion)
        accountSettings.changeRegion(mockRegion)

        val eventCaptor = argumentCaptor<MetricEvent>()
        val telemetryService = DefaultTelemetryService(
            messageBusService,
            MockAwsSettings(true, true, UUID.randomUUID()),
            batcher
        )

        telemetryService.record("Foo", TelemetryService.MetricEventMetadata(
            awsAccount = "222222222222",
            awsRegion = "bar-region"
        ))
        telemetryService.dispose()

        verify(batcher, times(3)).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues, "Foo", "222222222222", "bar-region")
    }

    private fun assertMetricEventsContains(events: List<MetricEvent>, namespace: String, awsAccount: String, awsRegion: String) {
        val event = events.find {
            it.namespace == namespace && it.awsAccount == awsAccount && it.awsRegion == awsRegion
        }

        assertThat(event).isNotNull
    }
}