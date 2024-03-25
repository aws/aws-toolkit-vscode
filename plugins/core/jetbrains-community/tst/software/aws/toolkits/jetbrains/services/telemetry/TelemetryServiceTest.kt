// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.ide.highlighter.ProjectFileType
import com.intellij.openapi.project.ex.ProjectManagerEx
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.PlatformTestUtil
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TemporaryDirectory
import com.intellij.testFramework.createTestOpenProjectOptions
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_INVALID
import software.aws.toolkits.core.telemetry.DefaultMetricEvent.Companion.METADATA_NOT_SET
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.core.telemetry.TelemetryPublisher
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.waitUntilConnectionStateIsStable
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.services.sts.StsResources
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryServiceTest {
    private class TestTelemetryService(publisher: TelemetryPublisher = NoOpPublisher(), batcher: TelemetryBatcher) : TelemetryService(publisher, batcher)

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @JvmField
    @Rule
    val regionProvider = MockRegionProviderRule()

    @JvmField
    @Rule
    val credentialManager = MockCredentialManagerRule()

    @JvmField
    @Rule
    val connectionSettingsManager = ProjectAccountSettingsManagerRule(projectRule)

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @After
    fun tearDown() {
        AwsSettings.getInstance().isTelemetryEnabled = false
    }

    @Test
    fun testInitialTelemetrySetting() {
        AwsSettings.getInstance().isTelemetryEnabled = true

        val changeCountDown = CountDownLatch(1)
        val changeCaptor = argumentCaptor<Boolean>()

        val batcher = mock<TelemetryBatcher> {
            on { onTelemetryEnabledChanged(changeCaptor.capture()) }
                .doAnswer {
                    changeCountDown.countDown()
                }
        }

        TestTelemetryService(batcher = batcher)

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

        val telemetryService = TestTelemetryService(batcher = batcher)

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
        val telemetryService = TestTelemetryService(batcher = batcher)

        telemetryService.record(projectRule.project) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher).enqueue(eventCaptor.capture())

        assertMetricEventsContains(eventCaptor.allValues, "Foo", METADATA_NOT_SET, "us-east-1")
    }

    @Test
    fun metricEventMetadataIsSet() {
        val credentials = credentialManager.addCredentials("profile:admin")
        val mockRegion = regionProvider.createAwsRegion()

        addAccountId(credentials, mockRegion)

        connectionSettingsManager.settingsManager.changeCredentialProvider(credentials)
        connectionSettingsManager.settingsManager.changeRegion(mockRegion)
        connectionSettingsManager.settingsManager.waitUntilConnectionStateIsStable()

        // assert that connection setting succeeded. This test has been failing sometimes in the assert stage that there is nothing
        assertThat(connectionSettingsManager.settingsManager.connectionState).isInstanceOf(ConnectionState.ValidConnection::class.java)

        val eventCaptor = argumentCaptor<MetricEvent>()
        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher = batcher)

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
        val credentials = credentialManager.addCredentials("profile:admin")

        addAccountId(credentials, accountSettings.activeRegion)
        accountSettings.changeCredentialProvider(credentials)

        val mockRegion = AwsRegion("foo-region", "foo-region", "aws")
        regionProvider.addRegion(mockRegion)
        accountSettings.changeRegion(mockRegion)

        val eventCaptor = argumentCaptor<MetricEvent>()

        val batcher = mock<TelemetryBatcher>()
        val telemetryService = TestTelemetryService(batcher = batcher)

        telemetryService.record(
            MetricEventMetadata(
                awsAccount = "123456789012",
                awsRegion = "bar-region"
            )
        ) {
            datum("Foo")
        }
        telemetryService.dispose()

        verify(batcher).enqueue(eventCaptor.capture())
        assertMetricEventsContains(eventCaptor.allValues, "Foo", "123456789012", "bar-region")
    }

    @Test
    fun telemetryCanBeSendOnAfterProjectClosed() {
        // Create a temp project that we own the life cycle for
        val projectFile = TemporaryDirectory.generateTemporaryPath("project_telemetryCanBeSendOnAfterProjectClosed${ProjectFileType.DOT_DEFAULT_EXTENSION}")
        val options = createTestOpenProjectOptions(runPostStartUpActivities = false)
        val project = ProjectManagerEx.getInstanceEx().openProject(projectFile, options)!!
        try {
            val credentials = credentialManager.addCredentials("profile:admin")
            val mockRegion = regionProvider.createAwsRegion()

            addAccountId(credentials, mockRegion)

            val connectionSettingsManager = AwsConnectionManager.getInstance(project)

            connectionSettingsManager.changeCredentialProvider(credentials)
            connectionSettingsManager.changeRegion(mockRegion)
            connectionSettingsManager.waitUntilConnectionStateIsStable()

            val batcher = mock<TelemetryBatcher>()
            val telemetryService = TestTelemetryService(batcher = batcher)

            telemetryService.record(project) {
                datum("Foo")
            }

            PlatformTestUtil.forceCloseProjectWithoutSaving(project)

            telemetryService.record(project) {
                datum("Bar")
            }

            telemetryService.dispose()

            argumentCaptor<MetricEvent>().apply {
                verify(batcher, times(2)).enqueue(capture())

                assertMetricEventsContains(allValues, "Foo", "1111222233333", mockRegion.id)
                assertMetricEventsContains(allValues, "Bar", METADATA_INVALID, METADATA_INVALID)
            }
        } finally {
            // Make sure we closed it if test failed
            if (project.isOpen) {
                PlatformTestUtil.forceCloseProjectWithoutSaving(project)
            }
        }
    }

    @Test
    fun disposeClosesThePublisher() {
        val mockPublisher = mock<TelemetryPublisher>()
        val mockBatcher = mock<TelemetryBatcher>()

        val telemetryService = TestTelemetryService(mockPublisher, mockBatcher)
        telemetryService.dispose()

        verify(mockBatcher).shutdown()
        verify(mockPublisher).close()
    }

    private fun addAccountId(credentialsIdentifier: CredentialIdentifier, region: AwsRegion) {
        resourceCache.addEntry(StsResources.ACCOUNT, region.id, credentialsIdentifier.id, "1111222233333")
    }

    private fun assertMetricEventsContains(events: Collection<MetricEvent>, eventName: String, awsAccount: String, awsRegion: String) {
        assertThat(events).filteredOn { event ->
            event.data.any { it.name == eventName }
        }.anySatisfy {
            assertThat(it.awsAccount).isEqualTo(awsAccount)
            assertThat(it.awsRegion).isEqualTo(awsRegion)
        }
    }
}
