// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleServiceManager
import software.aws.toolkits.jetbrains.services.lambda.deploy.CreateCapabilities

@State(name = "syncSettings")
class SyncSettings : PersistentStateComponent<SyncConfigs> {
    private var state = SyncConfigs()

    override fun getState(): SyncConfigs = state

    override fun loadState(state: SyncConfigs) {
        this.state = state
    }

    fun samStackName(samPath: String): String? = state.samConfigs[samPath]?.stackName
    fun setSamStackName(samPath: String, value: String) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.stackName = value
    }

    fun samBucketName(samPath: String): String? = state.samConfigs[samPath]?.bucketName
    fun setSamBucketName(samPath: String, value: String) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.bucketName = value
    }

    fun samEcrRepoUri(samPath: String): String? = state.samConfigs[samPath]?.repoUri
    fun setSamEcrRepoUri(samPath: String, value: String?) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.repoUri = value
    }

    fun samUseContainer(samPath: String): Boolean? = state.samConfigs[samPath]?.useContainer
    fun setSamUseContainer(samPath: String, value: Boolean) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.useContainer = value
    }

    fun enabledCapabilities(samPath: String): List<CreateCapabilities>? = state.samConfigs[samPath]?.enabledCapabilities
    fun setEnabledCapabilities(samPath: String, value: List<CreateCapabilities>) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.enabledCapabilities = value
    }

    fun samTags(samPath: String): Map<String, String>? = state.samConfigs[samPath]?.tags
    fun setSamTags(samPath: String, value: Map<String, String>) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.tags = value
    }

    fun samTempParameterOverrides(samPath: String): Map<String, String>? = state.samConfigs[samPath]?.tempParameterOverrides
    fun setSamTempParameterOverrides(samPath: String, value: Map<String, String>) {
        state.samConfigs.computeIfAbsent(samPath) { SyncSamConfig() }.tempParameterOverrides = value
    }

    companion object {
        fun getInstance(module: Module): SyncSettings? = ModuleServiceManager.getService(module, SyncSettings::class.java)
    }
}

data class SyncConfigs(
    var samConfigs: MutableMap<String, SyncSamConfig> = mutableMapOf()
)

data class SyncSamConfig(
    var stackName: String? = null,
    var bucketName: String? = null,
    var repoUri: String? = null,
    var useContainer: Boolean = false,
    var enabledCapabilities: List<CreateCapabilities>? = null,
    var tags: Map<String, String>? = null,
    var tempParameterOverrides: Map<String, String>? = null
)
