// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.util.registry.Registry
import com.jetbrains.python.run.AbstractPythonRunConfiguration
import com.jetbrains.python.run.PythonRunConfigurationExtension
import org.jdom.Element
import software.aws.toolkits.resources.message

class PythonAwsConnectionExtension : PythonRunConfigurationExtension() {
    private val delegate = AwsConnectionRunConfigurationExtension<AbstractPythonRunConfiguration<*>>()

    override fun isApplicableFor(configuration: AbstractPythonRunConfiguration<*>): Boolean = isEnabled()

    override fun isEnabledFor(applicableConfiguration: AbstractPythonRunConfiguration<*>, runnerSettings: RunnerSettings?): Boolean = isEnabled()

    override fun patchCommandLine(
        configuration: AbstractPythonRunConfiguration<*>,
        runnerSettings: RunnerSettings?,
        cmdLine: GeneralCommandLine,
        runnerId: String
    ) {
        if (isEnabled()) {
            delegate.addEnvironmentVariables(configuration, cmdLine, runtimeString = { configuration.getSdk()?.versionString })
        }
    }

    override fun readExternal(runConfiguration: AbstractPythonRunConfiguration<*>, element: Element) = delegate.readExternal(runConfiguration, element)

    override fun writeExternal(runConfiguration: AbstractPythonRunConfiguration<*>, element: Element) = delegate.writeExternal(runConfiguration, element)

    override fun getEditorTitle() = message("aws_connection.tab.label")

    override fun <P : AbstractPythonRunConfiguration<*>?> createEditor(configuration: P): SettingsEditor<P>? = connectionSettingsEditor(
        configuration
    )

    private fun isEnabled() = Registry.`is`(FEATURE_ID)

    companion object {
        const val FEATURE_ID = "aws.feature.pythonRunConfigurationExtension"
    }
}
