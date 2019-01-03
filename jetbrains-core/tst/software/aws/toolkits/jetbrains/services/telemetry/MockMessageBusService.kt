// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.util.messages.MessageBus
import com.intellij.util.messages.Topic
import com.intellij.util.messages.impl.MessageBusImpl

class MockMessageBusService : MessageBusService {
    override val messageBus: MessageBus = MessageBusImpl.RootBus(this)
    override val telemetryEnabledTopic: Topic<TelemetryEnabledChangedNotifier> = Topic.create(
        "TELEMETRY_ENABLED_TOPIC",
        TelemetryEnabledChangedNotifier::class.java
    )
}
