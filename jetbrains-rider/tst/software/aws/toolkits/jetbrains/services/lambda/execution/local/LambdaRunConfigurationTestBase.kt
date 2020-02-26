// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.jetbrains.rider.test.base.BaseTestWithSolution
import org.testng.annotations.AfterMethod
import org.testng.annotations.BeforeMethod
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommonTestUtils

abstract class LambdaRunConfigurationTestBase : BaseTestWithSolution() {

    companion object {
        protected const val HANDLER_EVALUATE_TIMEOUT_MS = 20000
    }

    protected val mockId = "MockCredsId"
    protected val mockCreds = AwsBasicCredentials.create("Access", "ItsASecret")

    protected val runtime = Runtime.DOTNETCORE2_1
    protected val defaultHandler = "HelloWorld::HelloWorld.Function::FunctionHandler"
    protected val defaultInput = "inputText"

    protected var validSam: String = ""

    @BeforeMethod
    fun setUpCredentialsManager() {
        validSam = SamCommonTestUtils.makeATestSam(SamCommonTestUtils.getMinVersionAsJson()).toString()

        MockCredentialsManager.getInstance().addCredentials(mockId, mockCreds)
    }

    @AfterMethod
    fun resetCredentialsManager() {
        MockCredentialsManager.getInstance().reset()
    }

    protected fun createHandlerBasedRunConfiguration(handler: String? = defaultHandler, input: String? = defaultInput) =
        createHandlerBasedRunConfiguration(
            project = project,
            runtime = runtime,
            handler = handler,
            input = input,
            credentialsProviderId = mockId
        )

    protected fun preWarmLambdaHandlerValidation(handler: String = defaultHandler) =
        preWarmLambdaHandlerValidation(project, runtime, handler, HANDLER_EVALUATE_TIMEOUT_MS)
}
