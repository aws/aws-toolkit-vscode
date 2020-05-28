// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import java.util.UUID
import java.util.prefs.Preferences

interface AwsSettings {
    var isTelemetryEnabled: Boolean
    var promptedForTelemetry: Boolean
    val clientId: UUID

    companion object {
        @JvmStatic
        fun getInstance(): AwsSettings = ServiceManager.getService(AwsSettings::class.java)
    }
}

@State(name = "aws", storages = [Storage("aws.xml")])
class DefaultAwsSettings : PersistentStateComponent<AwsConfiguration>, AwsSettings {
    private val preferences = Preferences.userRoot().node(this.javaClass.canonicalName)
    private var state = AwsConfiguration()

    override fun getState(): AwsConfiguration = state

    override fun loadState(state: AwsConfiguration) {
        this.state = state
    }

    override var isTelemetryEnabled: Boolean
        get() = state.isTelemetryEnabled ?: true
        set(value) {
            state.isTelemetryEnabled = value
            TelemetryService.getInstance().setTelemetryEnabled(value)
        }

    override var promptedForTelemetry: Boolean
        get() = state.promptedForTelemetry ?: false
        set(value) {
            state.promptedForTelemetry = value
        }

    override val clientId: UUID
        @Synchronized get() = UUID.fromString(preferences.get(CLIENT_ID_KEY, UUID.randomUUID().toString())).also {
            preferences.put(CLIENT_ID_KEY, it.toString())
        }

    companion object {
        const val CLIENT_ID_KEY = "CLIENT_ID"
    }
}

data class AwsConfiguration(
    var isTelemetryEnabled: Boolean? = null,
    var promptedForTelemetry: Boolean? = null
)
