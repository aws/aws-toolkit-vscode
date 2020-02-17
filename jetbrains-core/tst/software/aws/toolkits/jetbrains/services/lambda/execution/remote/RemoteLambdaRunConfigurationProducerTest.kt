// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.remote

import com.intellij.execution.Location
import com.intellij.execution.actions.ConfigurationContext
import com.intellij.execution.actions.ConfigurationFromContext
import com.intellij.execution.actions.RunConfigurationProducer
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.testFramework.MapDataContext
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction

class RemoteLambdaRunConfigurationProducerTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Test
    fun validRunConfigurationIsCreated() {
        val functionName = "SomeFunction"
        val region = AwsRegion("us-east-1", "us-east-1", "aws")
        val credentialProviderId = MockProjectAccountSettingsManager.getInstance(projectRule.project).connectionSettings()?.credentials

        val lambdaLocation = LambdaFunction(
            name = functionName,
            description = null,
            arn = "arn",
            lastModified = "someDate",
            handler = "someHandler",
            runtime = Runtime.values().first(),
            envVariables = emptyMap(),
            timeout = 60,
            memorySize = 128,
            xrayEnabled = false,
            role = IamRole("DummyRoleArn")
        )

        runInEdtAndWait {
            val runConfiguration = createRunConfiguration(lambdaLocation)
            assertThat(runConfiguration).isNotNull
            val configuration = runConfiguration?.configuration as RemoteLambdaRunConfiguration
            assertThat(configuration.functionName()).isEqualTo(functionName)
            assertThat(configuration.credentialProviderId()).isEqualTo(credentialProviderId?.id)
            assertThat(configuration.regionId()).isEqualTo(region.id)
            assertThat(configuration.name).isEqualTo("[Remote] $functionName")
        }
    }

    private fun createRunConfiguration(function: LambdaFunction): ConfigurationFromContext? {
        val dataContext = MapDataContext()
        val context = createContext(function, dataContext)
        val producer = RunConfigurationProducer.getInstance(RemoteLambdaRunConfigurationProducer::class.java)
        return producer.createConfigurationFromContext(context)
    }

    private fun createContext(function: LambdaFunction, dataContext: MapDataContext): ConfigurationContext {
        dataContext.put(CommonDataKeys.PROJECT, projectRule.project)
        dataContext.put(Location.DATA_KEY, RemoteLambdaLocation(projectRule.project, function))
        return ConfigurationContext.getFromContext(dataContext)
    }
}
