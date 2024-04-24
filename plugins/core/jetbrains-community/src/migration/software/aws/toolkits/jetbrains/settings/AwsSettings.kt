// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.service
import software.aws.toolkits.jetbrains.settings.ProfilesNotification
import software.aws.toolkits.jetbrains.settings.UseAwsCredentialRegion
import java.util.*

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
