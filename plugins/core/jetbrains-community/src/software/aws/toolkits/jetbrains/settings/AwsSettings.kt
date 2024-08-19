// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.resources.AwsCoreBundle
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.UiTelemetry
import java.util.UUID
import java.util.prefs.Preferences

enum class ProfilesNotification(private val description: String) {
    Always(AwsCoreBundle.message("settings.profiles.always")),
    OnFailure(AwsCoreBundle.message("settings.profiles.on_failure")),
    Never(AwsCoreBundle.message("settings.profiles.never"));

    override fun toString(): String = description
}

enum class UseAwsCredentialRegion(private val description: String) {
    Always(AwsCoreBundle.message("settings.credentials.prompt_for_default_region_switch.always.description")),
    Prompt(AwsCoreBundle.message("settings.credentials.prompt_for_default_region_switch.ask.description")),
    Never(AwsCoreBundle.message("settings.credentials.prompt_for_default_region_switch.never.description"));

    override fun toString(): String = description
}

typealias AwsSettings = migration.software.aws.toolkits.jetbrains.settings.AwsSettings

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
            val enablementElement = if (value) "aws_enabledTelemetry" else "aws_disabledTelemetry"
            TelemetryService.getInstance().setTelemetryEnabled(value) {
                UiTelemetry.click(null as Project?, enablementElement)
            }
            state.isTelemetryEnabled = value
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
            if (state.isAutoUpdateEnabled != value) {
                val settingState = if (value) "OPTIN" else "OPTOUT"
                AwsTelemetry.modifySetting(project = null, settingId = ID_AUTO_UPDATE, settingState = settingState)
            }
            state.isAutoUpdateEnabled = value
        }

    override var isAutoUpdateNotificationEnabled: Boolean
        get() = state.isAutoUpdateNotificationEnabled ?: true
        set(value) {
            if (isAutoUpdateNotificationEnabled != value) {
                val settingsState = if (value) "OPTIN" else "OPTOUT"
                AwsTelemetry.modifySetting(project = null, settingId = ID_AUTO_UPDATE_NOTIFY, settingState = settingsState)
            }
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
        private const val ID_AUTO_UPDATE = "autoUpdate"
        private const val ID_AUTO_UPDATE_NOTIFY = "autoUpdateNotification"
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
