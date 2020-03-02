// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.schemas.search.SchemaSearchDialogManager.DialogStateCacheKey.AllRegistriesDialogStateCacheKey
import software.aws.toolkits.jetbrains.services.schemas.search.SchemaSearchDialogManager.DialogStateCacheKey.SingleRegistryDialogStateCacheKey

class SchemaSearchDialogManager {
    private val searchDialogStateCache: MutableMap<SingleRegistryDialogStateCacheKey, SchemaSearchDialogState> = mutableMapOf()
    private val allRegistriesSearchDialogStateCache: MutableMap<AllRegistriesDialogStateCacheKey, SchemaSearchDialogState> = mutableMapOf()

    fun searchRegistryDialog(registry: String, project: Project): DialogWrapper {
        val credentialId = ProjectAccountSettingsManager.getInstance(project).activeCredentialProvider.id
        val region = ProjectAccountSettingsManager.getInstance(project).activeRegion.id

        val dialog = SchemaSearchSingleRegistryDialog(
            registry,
            project,
            onCancelCallback = { state -> cacheSingleRegistryDialogStateOnCancel(registry, credentialId, region, state) }
        )

        val key = SingleRegistryDialogStateCacheKey(registry, credentialId, region)
        val dialogState = searchDialogStateCache.getOrDefault(key, null)
        if (dialogState == null) {
            dialog.initializeNew()
        } else {
            dialog.initializeFromState(dialogState)
        }

        return dialog
    }

    fun searchAllRegistriesDialog(project: Project): DialogWrapper {
        val credentialId = ProjectAccountSettingsManager.getInstance(project).activeCredentialProvider.id
        val region = ProjectAccountSettingsManager.getInstance(project).activeRegion.id

        val dialog = SchemaSearchAllRegistriesDialog(
            project,
            onCancelCallback = { state -> cacheAllRegistriesDialogStateOnCancel(credentialId, region, state) }
        )

        val key = AllRegistriesDialogStateCacheKey(credentialId, region)
        val dialogState = allRegistriesSearchDialogStateCache.getOrDefault(key, null)
        if (dialogState == null) {
            dialog.initializeNew()
        } else {
            dialog.initializeFromState(dialogState)
        }

        return dialog
    }

    private fun cacheSingleRegistryDialogStateOnCancel(registry: String, credentialId: String, region: String, state: SchemaSearchDialogState) {
        searchDialogStateCache[SingleRegistryDialogStateCacheKey(registry, credentialId, region)] = state
    }

    private fun cacheAllRegistriesDialogStateOnCancel(credentialId: String, region: String, state: SchemaSearchDialogState) {
        allRegistriesSearchDialogStateCache[AllRegistriesDialogStateCacheKey(credentialId, region)] = state
    }

    private sealed class DialogStateCacheKey {
        data class SingleRegistryDialogStateCacheKey(private val registry: String, private val credentialId: String, private val region: String) :
            DialogStateCacheKey()
        data class AllRegistriesDialogStateCacheKey(private val credentialId: String, private val region: String) : DialogStateCacheKey()
    }

    companion object {
        val INSTANCE = SchemaSearchDialogManager()
    }
}
