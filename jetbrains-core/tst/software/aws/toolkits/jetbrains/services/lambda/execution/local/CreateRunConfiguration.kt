// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.RunManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration

fun createTemplateRunConfiguration(
    project: Project,
    input: String? = "inputText",
    templateFile: String? = null,
    logicalId: String? = null,
    inputIsFile: Boolean = false,
    credentialsProviderId: String? = null,
    region: AwsRegion? = MockRegionProvider.US_EAST_1,
    environmentVariables: MutableMap<String, String> = mutableMapOf()
): SamRunConfiguration {
    val runConfiguration = samRunConfiguration(project)
    runConfiguration.useTemplate(templateFile, logicalId)

    createBaseRunConfiguration(
        runConfiguration,
        region,
        credentialsProviderId,
        environmentVariables,
        inputIsFile,
        input
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
    region: AwsRegion? = MockRegionProvider.US_EAST_1,
    environmentVariables: MutableMap<String, String> = mutableMapOf()
): SamRunConfiguration {
    val runConfiguration = samRunConfiguration(project)
    runConfiguration.useHandler(runtime, handler)

    createBaseRunConfiguration(
        runConfiguration,
        region,
        credentialsProviderId,
        environmentVariables,
        inputIsFile,
        input
    )

    return runConfiguration
}

private fun createBaseRunConfiguration(
    runConfiguration: SamRunConfiguration,
    region: AwsRegion?,
    credentialsProviderId: String?,
    environmentVariables: MutableMap<String, String>,
    inputIsFile: Boolean,
    input: String?
) {
    runConfiguration.regionId(region?.id)
    runConfiguration.credentialProviderId(credentialsProviderId)
    runConfiguration.environmentVariables(environmentVariables)

    if (inputIsFile) {
        runConfiguration.useInputFile(input)
    } else {
        runConfiguration.useInputText(input)
    }
}

fun samRunConfiguration(project: Project): SamRunConfiguration {
    val runManager = RunManager.getInstance(project)
    val factory = LambdaRunConfiguration.getInstance().configurationFactories.first { it is SamRunConfigurationFactory }
    val runConfigurationAndSettings = runManager.createConfiguration("Test", factory)
    val runConfiguration = runConfigurationAndSettings.configuration as SamRunConfiguration
    runManager.addConfiguration(runConfigurationAndSettings)
    return runConfiguration
}