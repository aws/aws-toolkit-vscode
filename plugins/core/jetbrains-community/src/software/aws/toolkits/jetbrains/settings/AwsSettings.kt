// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.resources.message
import java.util.UUID
import java.util.prefs.Preferences

interface AwsSettings {
    var isTelemetryEnabled: Boolean
    var promptedForTelemetry: Boolean
    var useDefaultCredentialRegion: UseAwsCredentialRegion
    var profilesNotification: ProfilesNotification
    var isAutoUpdateEnabled: Boolean
    var isAutoUpdateNotificationEnabled: Boolean
    var isAutoUpdateFeatureNotificationShownOnce: Boolean
    var isQMigrationNotificationShownOnce: Boolean
    val clientId: UUID

    companion object {
        @JvmStatic
        fun getInstance(): AwsSettings = service()
    }
}

enum class ProfilesNotification(private val description: String) {
    Always(message("settings.profiles.always")),
    OnFailure(message("settings.profiles.on_failure")),
    Never(message("settings.profiles.never"));

    override fun toString(): String = description
}

enum class UseAwsCredentialRegion(private val description: String) {
    Always(message("settings.credentials.prompt_for_default_region_switch.always.description")),
    Prompt(message("settings.credentials.prompt_for_default_region_switch.ask.description")),
    Never(message("settings.credentials.prompt_for_default_region_switch.never.description"));

    override fun toString(): String = description
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

    override var useDefaultCredentialRegion: UseAwsCredentialRegion
        get() = state.useDefaultCredentialRegion?.let { UseAwsCredentialRegion.valueOf(it) } ?: UseAwsCredentialRegion.Prompt
        set(value) {
            state.useDefaultCredentialRegion = value.name
        }

    override var profilesNotification: ProfilesNotification
        get() = state.profilesNotification?.let { ProfilesNotification.valueOf(it) } ?: ProfilesNotification.Always
        set(value) {
            state.profilesNotification = value.name
        }

    override var isAutoUpdateEnabled: Boolean
        get() = state.isAutoUpdateEnabled ?: true
        set(value) {
            state.isAutoUpdateEnabled = value
        }

    override var isAutoUpdateNotificationEnabled: Boolean
        get() = state.isAutoUpdateNotificationEnabled ?: true
        set(value) {
            state.isAutoUpdateNotificationEnabled = value
        }

    override var isAutoUpdateFeatureNotificationShownOnce: Boolean
        get() = state.isAutoUpdateFeatureNotificationShownOnce ?: false
        set(value) {
            state.isAutoUpdateFeatureNotificationShownOnce = value
        }

    override var isQMigrationNotificationShownOnce: Boolean
        get() = state.isQMigrationNotificationShownOnce ?: false
        set(value) {
            state.isQMigrationNotificationShownOnce = value
        }

    override val clientId: UUID
        @Synchronized get() {
            val id = when {
                ApplicationManager.getApplication().isUnitTestMode || System.getProperty("robot-server.port") != null -> "ffffffff-ffff-ffff-ffff-ffffffffffff"
                isTelemetryEnabled == false -> "11111111-1111-1111-1111-111111111111"
                else -> {
                    preferences.get(CLIENT_ID_KEY, UUID.randomUUID().toString()).also {
                        preferences.put(CLIENT_ID_KEY, it.toString())
                    }
                }
            }

            return UUID.fromString(id)
        }

    companion object {
        const val CLIENT_ID_KEY = "CLIENT_ID"
    }
}

data class AwsConfiguration(
    var isTelemetryEnabled: Boolean? = null,
    var promptedForTelemetry: Boolean? = null,
    var useDefaultCredentialRegion: String? = null,
    var profilesNotification: String? = null,
    var isAutoUpdateEnabled: Boolean? = null,
    var isAutoUpdateNotificationEnabled: Boolean? = null,
    var isAutoUpdateFeatureNotificationShownOnce: Boolean? = null,
    var isQMigrationNotificationShownOnce: Boolean? = null
)
