// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.RunConfigurationExtension
import com.intellij.execution.application.ApplicationConfiguration
import com.intellij.execution.configurations.JavaParameters
import com.intellij.execution.configurations.RunConfigurationBase
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.openapi.externalSystem.service.execution.ExternalSystemRunConfiguration
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.projectRoots.JavaSdk
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.util.registry.Registry
import org.jdom.Element
import software.aws.toolkits.resources.message

class JavaAwsConnectionExtension : RunConfigurationExtension() {
    private val delegate = AwsConnectionRunConfigurationExtension<RunConfigurationBase<*>>()

    /*
     * This works with Maven and IntelliJ managed, but breaks for Gradle. In gradle the run config runs another run config (the actual Gradle one), which
     * does not pass down the environment variables. The base that controls this is ExternalSystemRunConfiguration, so we should use that to be safe
     * so that we don't encounter a similar situation with a different class based on it.
     */
    override fun isApplicableFor(configuration: RunConfigurationBase<*>): Boolean =
        Registry.`is`(FEATURE_ID) && configuration !is ExternalSystemRunConfiguration

    override fun <T : RunConfigurationBase<*>?> updateJavaParameters(configuration: T, params: JavaParameters, runnerSettings: RunnerSettings?) {
        if (Registry.`is`(FEATURE_ID)) {
            configuration ?: return
            val environment = params.env

            delegate.addEnvironmentVariables(configuration, environment, runtimeString = { determineVersion(configuration) })
        }
    }

    override fun getEditorTitle() = message("aws_connection.tab.label")

    override fun <T : RunConfigurationBase<*>?> createEditor(configuration: T): SettingsEditor<T>? = connectionSettingsEditor(configuration)

    override fun readExternal(runConfiguration: RunConfigurationBase<*>, element: Element) = delegate.readExternal(runConfiguration, element)

    override fun writeExternal(runConfiguration: RunConfigurationBase<*>, element: Element) = delegate.writeExternal(runConfiguration, element)

    private fun <T> determineVersion(configuration: T): String? = (configuration as? ApplicationConfiguration)?.let {
        configuration.configurationModule?.module
    }?.let {
        ModuleRootManager.getInstance(it).sdk
    }?.let {
        JavaSdk.getInstance().getVersion(it)?.name
    }

    companion object {
        const val FEATURE_ID = "aws.feature.javaRunConfigurationExtension"
    }
}
