// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import com.intellij.openapi.application.ApplicationManager
import com.intellij.util.messages.MessageBus
import com.intellij.util.messages.Topic

interface TelemetryEnabledChangedNotifier {
    fun notify(isTelemetryEnabled: Boolean)
}

interface MessageBusService {
    val messageBus: MessageBus

    val telemetryEnabledTopic: Topic<TelemetryEnabledChangedNotifier>
}

class DefaultMessageBusService : MessageBusService {
    override val messageBus: MessageBus = ApplicationManager.getApplication().messageBus

    override val telemetryEnabledTopic: Topic<TelemetryEnabledChangedNotifier> = Topic.create(
        "TELEMETRY_ENABLED_TOPIC",
        TelemetryEnabledChangedNotifier::class.java
    )
}
