// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.testutils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.testutils.rules.openClass

class LambdaHandlerIndexTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Before
    fun setUp() {
        projectRule.fixture.addClass(
            """
            package com.amazonaws.services.lambda.runtime;
            @SuppressWarnings("ALL")
            public interface Context {}
            """
        )

        projectRule.fixture.addClass(
            """
            package com.amazonaws.services.lambda.runtime;

            import com.amazonaws.services.lambda.runtime.Context;

            public interface RequestHandler<I, O> {
                O handleRequest(I input, Context context);
            }
            """
        )

        projectRule.fixture.addClass(
            """
            package com.amazonaws.services.lambda.runtime;

            import java.io.InputStream;
            import java.io.OutputStream;
            import java.io.IOException;

            public interface RequestStreamHandler {
                void handleRequest(InputStream input, OutputStream output, Context context) throws IOException;
            }
            """
        )
    }

    @Test
    fun testHandlerIsReturned() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class LambdaHandler {
                public static String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                .containsExactly("com.example.LambdaHandler::handleRequest")
        }
    }

    @Test
    fun testStaleDataIsNotReturned() {
        val fixture = projectRule.fixture

        val psiClass = fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class LambdaHandler {
                public static String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                .containsExactly("com.example.LambdaHandler::handleRequest")
        }

        WriteCommandAction.runWriteCommandAction(fixture.project) {
            psiClass.containingFile.virtualFile.delete(null)
        }

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                .isEmpty()
        }
    }
}