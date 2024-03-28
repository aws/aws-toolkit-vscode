// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.notification.NotificationAction
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.AwsRegionProvider
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.UseAwsCredentialRegion
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

/**
 * Encapsulates logic for handling of regions when a new credential identifier is selected
 */
interface CredentialsRegionHandler {
    fun determineSelectedRegion(identifier: CredentialIdentifier, selectedRegion: AwsRegion?): AwsRegion?

    companion object {
        fun getInstance(project: Project): CredentialsRegionHandler = project.service()
    }
}

internal class DefaultCredentialsRegionHandler(private val project: Project) : CredentialsRegionHandler {
    override fun determineSelectedRegion(identifier: CredentialIdentifier, selectedRegion: AwsRegion?): AwsRegion? {
        val settings = AwsSettings.getInstance()
        if (settings.useDefaultCredentialRegion == UseAwsCredentialRegion.Never) {
            return selectedRegion
        }

        val regionProvider = AwsRegionProvider.getInstance()
        val defaultCredentialRegion = identifier.defaultRegionId?.let { regionProvider[it] } ?: return selectedRegion
        when {
            selectedRegion == defaultCredentialRegion -> return defaultCredentialRegion
            selectedRegion?.partitionId != defaultCredentialRegion.partitionId -> return defaultCredentialRegion
            settings.useDefaultCredentialRegion == UseAwsCredentialRegion.Always -> return defaultCredentialRegion
            settings.useDefaultCredentialRegion == UseAwsCredentialRegion.Prompt -> promptForRegionChange(defaultCredentialRegion)
        }
        return selectedRegion
    }

    private fun promptForRegionChange(defaultCredentialRegion: AwsRegion) {
        notifyInfo(
            message("aws.notification.title"),
            message("settings.credentials.prompt_for_default_region_switch", defaultCredentialRegion.id),
            project = project,
            notificationActions = listOf(
                NotificationAction.createSimpleExpiring(message("settings.credentials.prompt_for_default_region_switch.yes")) {
                    AwsConnectionManager.getInstance(project).changeRegion(defaultCredentialRegion)
                },
                NotificationAction.createSimpleExpiring(message("settings.credentials.prompt_for_default_region_switch.always")) {
                    AwsSettings.getInstance().useDefaultCredentialRegion = UseAwsCredentialRegion.Always
                    AwsConnectionManager.getInstance(project).changeRegion(defaultCredentialRegion)
                },
                NotificationAction.createSimpleExpiring(message("settings.credentials.prompt_for_default_region_switch.never")) {
                    AwsSettings.getInstance().useDefaultCredentialRegion = UseAwsCredentialRegion.Never
                }
            )
        )
    }
}
