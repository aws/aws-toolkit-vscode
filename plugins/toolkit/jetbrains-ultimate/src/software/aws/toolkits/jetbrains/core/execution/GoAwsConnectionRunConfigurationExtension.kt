// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.goide.execution.GoRunConfigurationBase
import com.goide.execution.GoRunningState
import com.goide.execution.extension.GoRunConfigurationExtension
import com.goide.sdk.GoSdkService
import com.intellij.execution.configurations.RunnerSettings
import com.intellij.execution.target.TargetedCommandLineBuilder
import com.intellij.openapi.options.SettingsEditor
import org.jdom.Element
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.experiments.ToolkitExperiment
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.resources.message

class GoAwsConnectionRunConfigurationExtension : GoRunConfigurationExtension() {

    override fun isApplicableFor(configuration: GoRunConfigurationBase<*>) = GoAwsConnectionExperiment.isEnabled()

    override fun isEnabledFor(configuration: GoRunConfigurationBase<*>, settings: RunnerSettings?) = GoAwsConnectionExperiment.isEnabled()

    override fun <P : GoRunConfigurationBase<*>> createEditor(configuration: P): SettingsEditor<P> = connectionSettingsEditor(configuration)

    override fun getEditorTitle() = message("aws_connection.tab.label")

    override fun readExternal(runConfiguration: GoRunConfigurationBase<*>, element: Element) = delegate.readExternal(runConfiguration, element)

    override fun writeExternal(runConfiguration: GoRunConfigurationBase<*>, element: Element) = delegate.writeExternal(runConfiguration, element)

    override fun patchCommandLine(
        configuration: GoRunConfigurationBase<*>,
        runnerSettings: RunnerSettings?,
        cmdLine: TargetedCommandLineBuilder,
        runnerId: String,
        state: GoRunningState<out GoRunConfigurationBase<*>>,
        commandLineType: GoRunningState.CommandLineType
    ) {
        if (GoAwsConnectionExperiment.isEnabled()) {
            delegate.addToTargetCommandLineBuilder(configuration, cmdLine, runtimeString = { determineGoVersion(configuration) })
        }
    }

    companion object {
        private val delegate = AwsConnectionRunConfigurationExtension<GoRunConfigurationBase<*>>()
        private fun determineGoVersion(configuration: GoRunConfigurationBase<*>): String? = tryOrNull {
            GoSdkService.getInstance(configuration.getProject()).getSdk(configuration.getDefaultModule()).majorVersion.toString()
        }?.let { "Go $it" }
    }
}

object GoAwsConnectionExperiment : ToolkitExperiment(
    "goRunConfigurationExtension",
    { message("run_configuration_extension.feature.go.title") },
    { message("run_configuration_extension.feature.go.description") },
    default = true
)
