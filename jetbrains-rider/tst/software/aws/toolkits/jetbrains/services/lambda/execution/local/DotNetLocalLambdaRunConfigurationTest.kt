// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.local

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.testng.annotations.Test
import software.aws.toolkits.resources.message

class DotNetLocalLambdaRunConfigurationTest : LambdaRunConfigurationTestBase() {

    override fun getSolutionDirectoryName(): String = "SamHelloWorldApp"

    override val waitForCaches = true

    @Test
    fun testHandler_ValidHandler() {
        preWarmSamVersionCache(validSam)
        preWarmLambdaHandlerValidation(handler = defaultHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                handler = defaultHandler
            )
            assertThat(runConfiguration).isNotNull
            runConfiguration.checkConfiguration()
        }
    }

    @Test
    fun testHandler_NonExistingMethodName() {
        val nonExistingHandler = "HelloWorld::HelloWorld.Function::HandlerDoesNoteExist"
        preWarmSamVersionCache(validSam)
        preWarmLambdaHandlerValidation(handler = nonExistingHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                handler = nonExistingHandler
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", nonExistingHandler))
        }
    }

    @Test
    fun testHandler_NonExistingTypeName() {
        val nonExistingHandler = "HelloWorld::HelloWorld.UnknownFunction::FunctionHandler"
        preWarmSamVersionCache(validSam)
        preWarmLambdaHandlerValidation(handler = nonExistingHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                handler = nonExistingHandler
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", nonExistingHandler))
        }
    }

    @Test
    fun testHandler_InvalidHandlerString() {
        val invalidHandler = "Fake"
        preWarmSamVersionCache(validSam)
        preWarmLambdaHandlerValidation(handler = invalidHandler)

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                handler = invalidHandler
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.handler_not_found", invalidHandler))
        }
    }

    @Test
    fun testHandler_HandlerNotSet() {
        preWarmSamVersionCache(validSam)
        preWarmLambdaHandlerValidation()

        runInEdtAndWait {
            val runConfiguration = createHandlerBasedRunConfiguration(
                handler = null
            )
            assertThat(runConfiguration).isNotNull
            assertThatThrownBy { runConfiguration.checkConfiguration() }
                .isInstanceOf(RuntimeConfigurationError::class.java)
                .hasMessage(message("lambda.run_configuration.no_handler_specified"))
        }
    }
}
