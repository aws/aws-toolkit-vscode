// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.notification.NotificationAction
import com.intellij.openapi.components.ServiceManager
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
        fun getInstance(project: Project): CredentialsRegionHandler = ServiceManager.getService(project, CredentialsRegionHandler::class.java)
    }
}

internal open class DefaultCredentialsRegionHandler(private val project: Project) : CredentialsRegionHandler {
    private val regionProvider by lazy { AwsRegionProvider.getInstance() }
    private val settings by lazy { AwsSettings.getInstance() }

    override fun determineSelectedRegion(identifier: CredentialIdentifier, selectedRegion: AwsRegion?): AwsRegion? {
        if (settings.useDefaultCredentialRegion == UseAwsCredentialRegion.Never) {
            return selectedRegion
        }
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
                NotificationAction.create(message("settings.credentials.prompt_for_default_region_switch.yes")) { event, _ ->
                    ChangeRegionAction(defaultCredentialRegion).actionPerformed(event)
                },
                NotificationAction.create(message("settings.credentials.prompt_for_default_region_switch.always")) { event, _ ->
                    settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Always
                    ChangeRegionAction(defaultCredentialRegion).actionPerformed(event)
                },
                NotificationAction.createSimple(message("settings.credentials.prompt_for_default_region_switch.never")) {
                    settings.useDefaultCredentialRegion = UseAwsCredentialRegion.Never
                }
            )
        )
    }
}
