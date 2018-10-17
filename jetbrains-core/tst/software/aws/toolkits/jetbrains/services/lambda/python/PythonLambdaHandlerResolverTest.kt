// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.runReadAction
import com.jetbrains.python.psi.PyFunction
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class PythonLambdaHandlerResolverTest {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Test
    fun testPythonFunctionResolves() {
        projectRule.fixture.addFileToProject(
            "hello_world/app.py",
            """
            def handle(event, context):
                return "HelloWorld"
            """.trimIndent()
        )

        runReadAction {
            val elements =
                Lambda.findPsiElementsForHandler(
                    projectRule.project,
                    Runtime.PYTHON3_6,
                    "hello_world.app.handle"
                )
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PyFunction::class.java) {
                assertThat(it.qualifiedName).isEqualTo("hello_world.app.handle")
            }
        }
    }

    @Test
    fun testInvalidHandlerReturnsNothing() {
        projectRule.fixture.addFileToProject(
            "hello_world/app.py",
            """
            def handle(event, context):
                return "HelloWorld"
            """.trimIndent()
        )

        runReadAction {
            val elements = Lambda.findPsiElementsForHandler(
                projectRule.project,
                Runtime.PYTHON3_6,
                "hello_world"
            )
            assertThat(elements).hasSize(0)
        }
    }
}