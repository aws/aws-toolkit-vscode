// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import assertk.assert
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import com.intellij.util.messages.MessageBus
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doAnswer
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.verify
import org.junit.Test
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.settings.MockAwsSettings
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TelemetryServiceTest {
    private val batcher: TelemetryBatcher = mock()
    private val messageBusService: MessageBusService = MockMessageBusService()

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
        assert(changeCaptor.allValues).hasSize(1)
        assert(changeCaptor.firstValue).isEqualTo(true)
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
        assert(changeCaptor.allValues).hasSize(2)
        assert(changeCaptor.firstValue).isEqualTo(true)
        assert(changeCaptor.secondValue).isEqualTo(false)
    }
}