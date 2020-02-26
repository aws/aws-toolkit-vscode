// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.RunManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.executables.ExecutableManager
import software.aws.toolkits.jetbrains.core.executables.setExecutablePath
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType
import software.aws.toolkits.jetbrains.services.lambda.sam.SamExecutable
import software.aws.toolkits.jetbrains.services.lambda.sam.SamOptions
import software.aws.toolkits.jetbrains.services.lambda.sam.SamVersionCache
import software.aws.toolkits.jetbrains.services.lambda.validation.LambdaHandlerValidator
import java.nio.file.Paths
import java.security.InvalidParameterException

private const val TEST_EVALUATE_BLOCKING_TIMEOUT_MS = 2000

fun createTemplateRunConfiguration(
    project: Project,
    input: String? = "inputText",
    templateFile: String? = null,
    logicalId: String? = null,
    inputIsFile: Boolean = false,
    credentialsProviderId: String? = null,
    region: AwsRegion? = MockRegionProvider.getInstance().defaultRegion(),
    environmentVariables: MutableMap<String, String> = mutableMapOf(),
    samOptions: SamOptions = SamOptions()
): LocalLambdaRunConfiguration {
    val runConfiguration = samRunConfiguration(project)
    runConfiguration.useTemplate(templateFile, logicalId)

    createBaseRunConfiguration(
        runConfiguration,
        region,
        credentialsProviderId,
        environmentVariables,
        inputIsFile,
        input,
        samOptions
    )

    return runConfiguration
}

fun createHandlerBasedRunConfiguration(
    project: Project,
    runtime: Runtime? = Runtime.JAVA8,
    handler: String? = "com.example.LambdaHandler::handleRequest",
    input: String? = "inputText",
    inputIsFile: Boolean = false,
    credentialsProviderId: String? = null,
    region: AwsRegion? = MockRegionProvider.getInstance().defaultRegion(),
    environmentVariables: MutableMap<String, String> = mutableMapOf(),
    samOptions: SamOptions = SamOptions()
): LocalLambdaRunConfiguration {
    val runConfiguration = samRunConfiguration(project)
    runConfiguration.useHandler(runtime, handler)

    createBaseRunConfiguration(
        runConfiguration,
        region,
        credentialsProviderId,
        environmentVariables,
        inputIsFile,
        input,
        samOptions
    )

    return runConfiguration
}

private fun createBaseRunConfiguration(
    runConfiguration: LocalLambdaRunConfiguration,
    region: AwsRegion?,
    credentialsProviderId: String?,
    environmentVariables: MutableMap<String, String>,
    inputIsFile: Boolean,
    input: String?,
    samOptions: SamOptions
) {
    runConfiguration.regionId(region?.id)
    runConfiguration.credentialProviderId(credentialsProviderId)
    runConfiguration.environmentVariables(environmentVariables)

    if (inputIsFile) {
        runConfiguration.useInputFile(input)
    } else {
        runConfiguration.useInputText(input)
    }

    runConfiguration.buildInContainer(samOptions.buildInContainer)
    runConfiguration.skipPullImage(samOptions.skipImagePull)
    runConfiguration.dockerNetwork(samOptions.dockerNetwork)
}

fun samRunConfiguration(project: Project): LocalLambdaRunConfiguration {
    val runManager = RunManager.getInstance(project)
    val factory = LambdaRunConfigurationType.getInstance().configurationFactories.first { it is LocalLambdaRunConfigurationFactory }
    val runConfigurationAndSettings = runManager.createConfiguration("Test", factory)
    val runConfiguration = runConfigurationAndSettings.configuration as LocalLambdaRunConfiguration
    runManager.addConfiguration(runConfigurationAndSettings)
    return runConfiguration
}

fun preWarmSamVersionCache(path: String?, timeoutMs: Int = TEST_EVALUATE_BLOCKING_TIMEOUT_MS) {
    path ?: throw InvalidParameterException("Test SAM CLI executable path is not set")
    SamVersionCache.evaluateBlocking(path, timeoutMs)
    ExecutableManager.getInstance().setExecutablePath<SamExecutable>(Paths.get(path))
}

fun preWarmLambdaHandlerValidation(project: Project, runtime: Runtime, handler: String, timeoutMs: Int = TEST_EVALUATE_BLOCKING_TIMEOUT_MS) {
    val handlerValidator = project.service<LambdaHandlerValidator>()
    handlerValidator.evaluateBlocking(LambdaHandlerValidator.LambdaEntry(project, runtime, handler), timeoutMs)
}
