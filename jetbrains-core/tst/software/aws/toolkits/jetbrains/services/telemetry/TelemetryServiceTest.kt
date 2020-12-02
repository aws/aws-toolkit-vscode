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
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.credentials.waitUntilConnectionStateIsStable
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider.RegionProviderRule
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryServiceTest {
    private class TestTelemetryService(batcher: TelemetryBatcher) : TelemetryService(NoOpPublisher(), batcher)

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @JvmField
    @Rule
    val regionProvider = RegionProviderRule()

    @JvmField
    @Rule
    val connectionSettingsManager = ProjectAccountSettingsManagerRule(projectRule)

    @After
    fun tearDown() {
        AwsSettings.getInstance().isTelemetryEnabled = false

        MockCredentialsManager.getInstance().reset()
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
        connectionSettingsManager.settingsManager.nullifyCredentialProviderAndWait()

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
        val credentials = MockCredentialsManager.getInstance().addCredentials("profile:admin")
        val mockRegion = regionProvider.createAwsRegion()

        markConnectionSettingsAsValid(credentials, mockRegion)

        connectionSettingsManager.settingsManager.changeCredentialProvider(credentials)
        connectionSettingsManager.settingsManager.changeRegion(mockRegion)
        connectionSettingsManager.settingsManager.waitUntilConnectionStateIsStable()

        // assert that connection setting succeeded. This test has been failing sometimes in the assert stage that there is nothing
        assertThat(connectionSettingsManager.settingsManager.connectionState).isInstanceOf(ConnectionState.ValidConnection::class.java)

        val eventCaptor = argumentCaptor<MetricEvent>()
        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher)

        telemetryService.record(projectRule.project) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues, "Foo", "1111222233333", mockRegion.id)
    }

    @Test
    fun metricEventMetadataIsOverridden() {
        val accountSettings = MockAwsConnectionManager.getInstance(projectRule.project)
        val credentials = MockCredentialsManager.getInstance().addCredentials("profile:admin")

        markConnectionSettingsAsValid(credentials, accountSettings.activeRegion)
        accountSettings.changeCredentialProvider(credentials)

        val mockRegion = AwsRegion("foo-region", "foo-region", "aws")
        MockRegionProvider.getInstance().addRegion(mockRegion)
        accountSettings.changeRegion(mockRegion)

        val eventCaptor = argumentCaptor<MetricEvent>()

        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher)

        telemetryService.record(
            MetricEventMetadata(
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

    private fun markConnectionSettingsAsValid(credentialsIdentifier: CredentialIdentifier, region: AwsRegion) {
        resourceCache.addEntry(StsResources.ACCOUNT, region.id, credentialsIdentifier.id, "1111222233333")
    }

    private fun assertMetricEventsContains(events: Collection<MetricEvent>, event: String, awsAccount: String, awsRegion: String) {
        assertThat(events).anySatisfy { e ->
            assertThat(e.data).anySatisfy { assertThat(it.name).isEqualTo(event) }
            assertThat(e.awsAccount).isEqualTo(awsAccount)
            assertThat(e.awsRegion).isEqualTo(awsRegion)
        }
    }
}
