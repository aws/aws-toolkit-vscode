// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.experiments

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.extensions.ExtensionPointName
import software.aws.toolkits.jetbrains.AwsToolkit

/**
 * Used to control the state of an experimental feature.
 *
 * Use the `aws.toolkit.experiment` extensionpoint to register experiments. This surfaces the configuration in the AWS Settings panel - and in sub-menus.
 *
 * @param hidden determines whether this experiment should surface in the settings/menus; hidden experiments can only be enabled by system property or manually modifying config in aws.xml
 * @param default determines the default state of an experiment
 *
 * `ToolkitExperiment` implementations should be an `object` for example:
 *
 * ```
 * object MyExperiment : ToolkitExperiment(..)
 * ```
 *
 * This allows simple use at branch-points for the experiment via the available extension functions:
 *
 * ```
 * if (MyExperiment.isEnabled()) {
 *   // surface experience
 * }
 * ```
 */
abstract class ToolkitExperiment(
    internal val id: String,
    internal val title: () -> String,
    internal val description: () -> String,
    internal val hidden: Boolean = false,
    internal val default: Boolean = false
) {
    override fun equals(other: Any?) = (other as? ToolkitExperiment)?.id?.equals(id) == true
    override fun hashCode() = id.hashCode()
}

fun ToolkitExperiment.isEnabled(): Boolean = ToolkitExperimentManager.getInstance().isEnabled(this)
internal fun ToolkitExperiment.setState(enabled: Boolean) = ToolkitExperimentManager.getInstance().setState(this, enabled)

@State(name = "experiments", storages = [Storage("aws.xml")])
internal class ToolkitExperimentManager : PersistentStateComponent<Map<String, Boolean>> {
    private val enabledState = mutableMapOf<String, Boolean>()
    fun isEnabled(experiment: ToolkitExperiment): Boolean =
        EP_NAME.extensionList.contains(experiment) && enabledState.getOrDefault(experiment.id, getDefault(experiment))

    fun setState(experiment: ToolkitExperiment, enabled: Boolean) {
        if (enabled == getDefault(experiment)) {
            enabledState.remove(experiment.id)
        } else {
            enabledState[experiment.id] = enabled
        }
    }

    override fun getState(): Map<String, Boolean> = enabledState

    override fun loadState(state: Map<String, Boolean>) {
        enabledState.clear()
        enabledState.putAll(state)
    }

    private fun getDefault(experiment: ToolkitExperiment): Boolean {
        val systemProperty = System.getProperty("aws.experiment.${experiment.id}")
        return when {
            systemProperty != null -> systemProperty.isBlank() || systemProperty.equals("true", ignoreCase = true)
            AwsToolkit.isDeveloperMode() -> true
            else -> experiment.default
        }
    }

    companion object {
        internal val EP_NAME = ExtensionPointName.create<ToolkitExperiment>("aws.toolkit.experiment")
        internal fun getInstance(): ToolkitExperimentManager = service()
        internal fun visibileExperiments(): List<ToolkitExperiment> = EP_NAME.extensionList.filterNot { it.hidden }
    }
}
