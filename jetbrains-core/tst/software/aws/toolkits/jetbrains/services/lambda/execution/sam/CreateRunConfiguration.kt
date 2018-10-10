// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.sam

import com.intellij.execution.RunManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.services.lambda.execution.LambdaRunConfiguration

fun createRunConfiguration(
    project: Project,
    runtime: Runtime? = Runtime.JAVA8,
    handler: String? = "com.example.LambdaHandler::handleRequest",
    input: String? = "inputText",
    inputIsFile: Boolean = false,
    credentialsProviderId: String? = null,
    region: AwsRegion? = AwsRegion("us-east-1", "us-east-1")
): SamRunConfiguration {
    val runManager = RunManager.getInstance(project)
    val topLevelFactory = runManager.configurationFactories.first { it is LambdaRunConfiguration }
    val factory = topLevelFactory.configurationFactories.first { it is SamRunConfigurationFactory }
    val runConfigurationAndSettings = runManager.createRunConfiguration("Test", factory)
    val runConfiguration = runConfigurationAndSettings.configuration as SamRunConfiguration
    runManager.addConfiguration(runConfigurationAndSettings)

    runConfiguration.configure(runtime, handler, input, inputIsFile, mutableMapOf(), credentialsProviderId, region)

    return runConfiguration
}