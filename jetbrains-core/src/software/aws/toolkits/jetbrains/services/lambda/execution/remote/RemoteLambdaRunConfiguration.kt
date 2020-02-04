// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.ExecutionBundle
import com.intellij.execution.ExecutionException
import com.intellij.execution.Executor
import com.intellij.execution.configurations.ConfigurationFactory
import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.execution.runners.ExecutionEnvironment
import com.intellij.openapi.options.SettingsEditorGroup
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationBase
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.ui.connection.AwsConnectionSettingsEditor
import software.aws.toolkits.jetbrains.ui.connection.addAwsConnectionEditor
import software.aws.toolkits.resources.message

class RemoteLambdaRunConfigurationFactory(configuration: LambdaRunConfigurationType) : ConfigurationFactory(configuration) {
    override fun createTemplateConfiguration(project: Project) = RemoteLambdaRunConfiguration(project, this)

    override fun getName(): String = "Remote"
}

class RemoteLambdaRunConfiguration(project: Project, factory: ConfigurationFactory) :
    LambdaRunConfigurationBase<RemoteLambdaOptions>(project, factory, "Remote") {

    override val serializableOptions = RemoteLambdaOptions()

    override fun getConfigurationEditor(): SettingsEditorGroup<RemoteLambdaRunConfiguration> {
        val group = SettingsEditorGroup<RemoteLambdaRunConfiguration>()
        val remoteLambdaSettings = RemoteLambdaRunSettingsEditor(project)
        group.addEditor(ExecutionBundle.message("run.configuration.configuration.tab.title"), remoteLambdaSettings)
        group.addAwsConnectionEditor(AwsConnectionSettingsEditor(project, remoteLambdaSettings::updateFunctions))
        return group
    }

    override fun checkConfiguration() {
        functionName() ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_function_specified"))
        resolveRegion()
        resolveCredentials()
        checkInput()
    }

    override fun getState(executor: Executor, environment: ExecutionEnvironment): RemoteLambdaState {
        try {
            val functionName = functionName()
                ?: throw RuntimeConfigurationError(message("lambda.run_configuration.no_function_specified"))

            return RemoteLambdaState(
                environment,
                RemoteLambdaRunSettings(resolveCredentials(), resolveRegion(), functionName, resolveInput())
            )
        } catch (e: Exception) {
            throw ExecutionException(e.message, e)
        }
    }

    override fun suggestedName() = "[${message("lambda.run_configuration.remote")}] ${functionName()}"

    fun functionName(): String? = serializableOptions.functionOptions.functionName

    fun functionName(name: String?) {
        serializableOptions.functionOptions.functionName = name
    }
}

data class RemoteLambdaRunSettings(
    val credentialProvider: ToolkitCredentialsProvider,
    val region: AwsRegion,
    val functionName: String,
    val input: String
)
