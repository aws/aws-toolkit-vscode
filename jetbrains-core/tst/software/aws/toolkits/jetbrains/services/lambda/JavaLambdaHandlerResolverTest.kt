// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.psi.PsiClass
import com.intellij.psi.PsiMethod
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.testutils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.testutils.rules.openClass

class JavaLambdaHandlerResolverTest {
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
    fun testClassHandler() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import com.amazonaws.services.lambda.runtime.RequestHandler;

            public class LambdaHandler implements RequestHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(fixture.project, Runtime.JAVA8, "com.example.LambdaHandler")
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PsiClass::class.java) {
                assertThat(it.qualifiedName).isEqualTo("com.example.LambdaHandler")
            }
        }
    }

    @Test
    fun testMethodHandler() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(fixture.project, Runtime.JAVA8, "com.example.LambdaHandler::handleRequest")
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PsiMethod::class.java) {
                assertThat(it.containingClass?.qualifiedName).isEqualTo("com.example.LambdaHandler")
                assertThat(it.name).isEqualTo("handleRequest")
            }
        }
    }

    @Test
    fun testClassNotFound() {
        val fixture = projectRule.fixture

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(fixture.project, Runtime.JAVA8, "com.example.LambdaHandler")
            assertThat(elements).isEmpty()
        }
    }

    @Test
    fun testMethodNotFound() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(fixture.project, Runtime.JAVA8, "com.example.LambdaHandler::someMethod")
            assertThat(elements).isEmpty()
        }
    }

    @Test
    fun testBaseMethodsReferenced() {
        val fixture = projectRule.fixture

        fixture.addClass(
            """
            package com.example;

            public abstract class AbstractHandler {
                public void handleRequest(InputStream input, OutputStream output, Context context) { }

                protected abstract void internalHandle();
            }
            """
        )

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import java.io.InputStream;
            import java.io.OutputStream;

            public class ConcreteHandler extends AbstractHandler {
                @Override
                protected  void internalHandle() { }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(fixture.project, Runtime.JAVA8, "com.example.ConcreteHandler::handleRequest")
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PsiMethod::class.java) {
                assertThat(it.containingClass?.qualifiedName).isEqualTo("com.example.AbstractHandler")
                assertThat(it.name).isEqualTo("handleRequest")
            }
        }
    }

    @Test
    fun testMultipleMethodsInSameClass() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            public abstract class LambdaHandler {
                public void handleRequest(InputStream input, OutputStream output, Context context) { }

                public void handleRequest(InputStream input, OutputStream output) { }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(fixture.project, Runtime.JAVA8, "com.example.LambdaHandler::handleRequest")
            assertThat(elements).isEmpty()
        }
    }
}