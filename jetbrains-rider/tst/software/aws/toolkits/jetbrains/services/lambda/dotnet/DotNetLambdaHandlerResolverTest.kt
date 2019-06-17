// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.jetbrains.rider.test.asserts.shouldBe
import com.jetbrains.rider.test.base.BaseTestWithSolution
import com.jetbrains.rider.test.framework.frameworkLogger
import org.testng.annotations.DataProvider
import org.testng.annotations.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda

/**
 * Tests to verify R# backend PSI element based on handler string
 */
class DotNetLambdaHandlerResolverTest : BaseTestWithSolution() {

    override fun getSolutionDirectoryName(): String = "SamHelloWorldApp"

    @Test
    fun testHandler_SingleValidHandler() {
        val handler = "HelloWorld::HelloWorld.Function::FunctionHandler"
        val handlerElements = Lambda.findPsiElementsForHandler(
                project,
                Runtime.DOTNETCORE2_1,
                handler
        )
        handlerElements.size.shouldBe(1, "Mismatch number of elements found for a specified handler string: $handler")
    }

    @DataProvider(name = "invalidHandlerData")
    fun invalidHandlerNameData() = arrayOf(
            arrayOf("InvalidMethodName", "HelloWorld::HelloWorld.Function::InvalidFunctionHandler"),
            arrayOf("MissTypeAndMethodHandler", "HelloWorld"),
            arrayOf("MissMethodName", "HelloWorld::HelloWorld.Function"),
            arrayOf("InvalidType", "HelloWorld::HelloWorld::FunctionHandler"),
            arrayOf("EmptyHandler", "")
    )

    @Test(dataProvider = "invalidHandlerData")
    fun testHandler_InvalidHandler(name: String, handler: String) {
        // Note: 'name' variable is used inside RiderTestFramework to generate a correct name from test instance.
        //       Log a name here as a placeholder to avoid linter errors
        frameworkLogger.info("Test name: $name")
        val handlerElements = Lambda.findPsiElementsForHandler(
                project,
                Runtime.DOTNETCORE2_1,
                handler
        )
        handlerElements.size.shouldBe(0, "Mismatch number of elements found for a specified handler string: $handler")
    }
}
