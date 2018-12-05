// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import java.util.prefs.Preferences
import java.util.UUID

@State(name = "aws", storages = [Storage("aws.xml")])
class AwsSettings : PersistentStateComponent<AwsConfiguration> {
    private val preferences = Preferences.userRoot().node(this.javaClass.canonicalName)
    private var state = AwsConfiguration()

    override fun getState(): AwsConfiguration = state

    override fun loadState(state: AwsConfiguration) {
        this.state = state
    }

    var isTelemetryEnabled: Boolean
        get() = state.isTelemetryEnabled ?: true
        set(value) {
            state.isTelemetryEnabled = value
        }

    var promptedForTelemetry: Boolean
        get() = state.promptedForTelemetry ?: false
        set(value) {
            state.promptedForTelemetry = value
        }

    val clientId: UUID
        @Synchronized get() = UUID.fromString(preferences.get(CLIENT_ID_KEY, UUID.randomUUID().toString())).also {
            preferences.put(CLIENT_ID_KEY, it.toString())
        }

    companion object {
        @JvmStatic
        fun getInstance(): AwsSettings = ServiceManager.getService(AwsSettings::class.java)

        const val CLIENT_ID_KEY = "CLIENT_ID"
    }
}

data class AwsConfiguration(
    var isTelemetryEnabled: Boolean? = null,
    var promptedForTelemetry: Boolean? = null
)
