// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.ModuleServiceManager
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.vfs.VirtualFile
import java.nio.file.Paths

@State(name = "deploySettings")
class DeploySettings : PersistentStateComponent<DeployConfigs> {
    private var state = DeployConfigs()

    override fun getState(): DeployConfigs = state

    override fun loadState(state: DeployConfigs) {
        this.state = state
    }

    fun samStackName(samPath: String): String? = state.samConfigs[samPath]?.stackName
    fun setSamStackName(samPath: String, value: String) {
        state.samConfigs.computeIfAbsent(samPath) { DeploySamConfig() }.stackName = value
    }

    fun samBucketName(samPath: String): String? = state.samConfigs[samPath]?.bucketName
    fun setSamBucketName(samPath: String, value: String) {
        state.samConfigs.computeIfAbsent(samPath) { DeploySamConfig() }.bucketName = value
    }

    fun samAutoExecute(samPath: String): Boolean? = state.samConfigs[samPath]?.autoExecute
    fun setSamAutoExecute(samPath: String, value: Boolean) {
        state.samConfigs.computeIfAbsent(samPath) { DeploySamConfig() }.autoExecute = value
    }

    fun samUseContainer(samPath: String): Boolean? = state.samConfigs[samPath]?.useContainer
    fun setSamUseContainer(samPath: String, value: Boolean) {
        state.samConfigs.computeIfAbsent(samPath) { DeploySamConfig() }.useContainer = value
    }

    companion object {
        @JvmStatic
        fun getInstance(module: Module): DeploySettings? = ModuleServiceManager.getService(module, DeploySettings::class.java)
    }
}

data class DeployConfigs(
    var samConfigs: MutableMap<String, DeploySamConfig> = mutableMapOf()
)

data class DeploySamConfig(
    var stackName: String? = null,
    var bucketName: String? = null,
    var autoExecute: Boolean = false,
    var useContainer: Boolean = false
)

/**
 * @return The relative SAM template file path against the module root. This is used as the key of SAM configs
 * @see DeployConfigs.samConfigs
 */
fun relativeSamPath(module: Module, templateFile: VirtualFile): String? = module.rootManager.contentRoots
        .find { Paths.get(templateFile.path).startsWith(it.path) }
        ?.let { Paths.get(it.path).relativize(Paths.get(templateFile.path)) }
        ?.toString()
