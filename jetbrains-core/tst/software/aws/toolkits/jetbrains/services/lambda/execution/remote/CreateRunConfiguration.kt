// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.RunManager
import com.intellij.openapi.project.Project
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfigurationType

fun createRunConfiguration(
    project: Project,
    input: String? = "",
    inputIsFile: Boolean = false,
    regionId: AwsRegion? = MockRegionProvider.US_EAST_1,
    credentialId: String? = "MockCredentials",
    functionName: String? = "DummyFunction"
): LambdaRemoteRunConfiguration {
    val runManager = RunManager.getInstance(project)
    val factory = LambdaRunConfigurationType.getInstance()
        .configurationFactories
        .first { it is LambdaRemoteRunConfigurationFactory }
    val runConfigurationAndSettings = runManager.createConfiguration("Test", factory)
    val runConfiguration = runConfigurationAndSettings.configuration as LambdaRemoteRunConfiguration
    runManager.addConfiguration(runConfigurationAndSettings)

    runConfiguration.credentialProviderId(credentialId)
    runConfiguration.regionId(regionId?.id)
    runConfiguration.functionName(functionName)
    if (inputIsFile) {
        runConfiguration.useInputFile(input)
    } else {
        runConfiguration.useInputText(input)
    }

    return runConfiguration
}