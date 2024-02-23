// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.execution

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.registry.Registry
import com.jetbrains.python.run.AbstractPythonRunConfiguration
import com.jetbrains.python.run.PythonExecution
import com.jetbrains.python.run.PythonRunParams
import com.jetbrains.python.run.target.HelpersAwareTargetEnvironmentRequest
import com.jetbrains.python.run.target.PythonCommandLineTargetEnvironmentProvider
import software.aws.toolkits.jetbrains.core.experiments.isEnabled

class PythonAwsConnectionCommandLineTargetEnvironmentProvider : PythonCommandLineTargetEnvironmentProvider {
    private val delegate = AwsConnectionRunConfigurationExtension<AbstractPythonRunConfiguration<*>>()

    override fun extendTargetEnvironment(
        project: Project,
        helpersAwareTargetRequest: HelpersAwareTargetEnvironmentRequest,
        pythonExecution: PythonExecution,
        runParams: PythonRunParams
    ) {
        if (!PythonAwsConnectionExperiment.isEnabled() && Registry.`is`("python.use.targets.api", true)) {
            return
        }

        val configuration = (runParams as? AbstractPythonRunConfiguration<*>)
            ?: return

        delegate.addToTargetEnvironment(configuration, pythonExecution.envs, runtimeString = { configuration.getSdk()?.versionString })
    }
}
