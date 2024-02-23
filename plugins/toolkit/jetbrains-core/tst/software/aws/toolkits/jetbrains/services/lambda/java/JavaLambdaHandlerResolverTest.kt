// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.DumbServiceImpl
import com.intellij.psi.PsiClass
import com.intellij.psi.PsiMethod
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.core.coroutines.EDT
import software.aws.toolkits.jetbrains.services.lambda.BuiltInRuntimeGroups
import software.aws.toolkits.jetbrains.services.lambda.Lambda
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass

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
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler"
            )
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PsiClass::class.java) {
                assertThat(it.qualifiedName).isEqualTo("com.example.LambdaHandler")
            }
        }
    }

    @Test
    fun testMethodReferenceWhenUsingHandlerInterface() {
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
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler::handleRequest"
            )
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PsiMethod::class.java) {
                assertThat(it.containingClass?.qualifiedName).isEqualTo("com.example.LambdaHandler")
                assertThat(it.name).isEqualTo("handleRequest")
            }
        }
    }

    @Test
    fun testMethodHandler() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class LambdaHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler::handleRequest"
            )
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
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler"
            )
            assertThat(elements).isEmpty()
        }
    }

    @Test
    fun testMethodNotFound() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class LambdaHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler::someMethod"
            )
            assertThat(elements).isEmpty()
        }
    }

    @Test
    fun testBaseMethodsReferenced() {
        val fixture = projectRule.fixture

        fixture.addClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

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
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.ConcreteHandler::handleRequest"
            )
            assertThat(elements).hasSize(1)
            assertThat(elements[0]).isInstanceOfSatisfying(PsiMethod::class.java) {
                assertThat(it.containingClass?.qualifiedName).isEqualTo("com.example.AbstractHandler")
                assertThat(it.name).isEqualTo("handleRequest")
            }
        }
    }

    @Test
    fun `resolves handlers with 2 parameters`() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import java.io.InputStream;
            import java.io.OutputStream;

            public class LambdaHandler {
                public static void streamsOnly(InputStream input, OutputStream output) { }

                public static void contextAndAnything(Object input, Context context) { }

                public static void doesNotResolve(Object input, OutputStream outputStream) { }

                public static void doesNotResolve2(InputStream input, Object outputStream) { }
            }
            """
        )

        runInEdtAndWait {
            val isHandlerValid: (String) -> Boolean = { handler -> Lambda.isHandlerValid(fixture.project, Runtime.JAVA17, handler) }

            assertThat(isHandlerValid("com.example.LambdaHandler::streamsOnly")).isTrue
            assertThat(isHandlerValid("com.example.LambdaHandler::contextAndAnything")).isTrue
            assertThat(isHandlerValid("com.example.LambdaHandler::doesNotResolve")).isFalse
            assertThat(isHandlerValid("com.example.LambdaHandler::doesNotResolve2")).isFalse
        }
    }

    @Test
    fun `resolves handlers with 1 parameter`() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import java.io.InputStream;

            public class LambdaHandler {
                public static void works(InputStream input) { }

                public static void alsoWorks(Object input) { }

                public static void alsoAlsoWorks(Context context) { }
            }
            """
        )

        runInEdtAndWait {
            val isHandlerValid: (String) -> Boolean = { handler -> Lambda.isHandlerValid(fixture.project, Runtime.JAVA17, handler) }

            assertThat(isHandlerValid("com.example.LambdaHandler::works")).isTrue
            assertThat(isHandlerValid("com.example.LambdaHandler::alsoWorks")).isTrue
            assertThat(isHandlerValid("com.example.LambdaHandler::alsoAlsoWorks")).isTrue
        }
    }

    @Test
    fun `resolves handlers with 3 parameters`() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import java.io.InputStream;
            import java.io.OutputStream;

            public class LambdaHandler {
                public static void works(InputStream input, OutputStream output, Context context) { }

                public static void doesntWork(Object input, OutputStream output, Context context) { }

                public static void doesntWork2(InputStream input, Object output, Context context) { }

                public static void doesntWork3(InputStream input, OutputStream output, Object context) { }
            }
            """
        )

        runInEdtAndWait {
            val isHandlerValid: (String) -> Boolean = { handler -> Lambda.isHandlerValid(fixture.project, Runtime.JAVA17, handler) }

            assertThat(isHandlerValid("com.example.LambdaHandler::works")).isTrue
            assertThat(isHandlerValid("com.example.LambdaHandler::doesntWork")).isFalse
            assertThat(isHandlerValid("com.example.LambdaHandler::doesntWork2")).isFalse
            assertThat(isHandlerValid("com.example.LambdaHandler::doesntWork3")).isFalse
        }
    }

    @Test
    fun testMultipleMethodsInSameClassParameterLength() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class LambdaHandler {
                // Should be picked due to more params
                public static void handleRequest(InputStream input, OutputStream output, Context context) { }

                public static void handleRequest(InputStream input, OutputStream output) { }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler::handleRequest"
            )
            assertThat(elements[0]).isInstanceOfSatisfying(PsiMethod::class.java) {
                assertThat(it.containingClass?.qualifiedName).isEqualTo("com.example.LambdaHandler")
                assertThat(it.name).isEqualTo("handleRequest")
                assertThat(it.parameterList.toString()).contains("InputStream input, OutputStream output, Context context")
            }
        }
    }

    @Test
    fun testMultipleMethodsInSameClassContextTakesPriority() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class LambdaHandler {
                public static void handleRequest(InputStream input, OutputStream output) { }

                // Should be picked due to ends in Context
                public static void handleRequest(InputStream input, Context context) { }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler::handleRequest"
            )
            assertThat(elements[0]).isInstanceOfSatisfying(PsiMethod::class.java) {
                assertThat(it.containingClass?.qualifiedName).isEqualTo("com.example.LambdaHandler")
                assertThat(it.name).isEqualTo("handleRequest")
                assertThat(it.parameterList.toString()).contains("InputStream input, Context context")
            }
        }
    }

    @Test
    fun testMultipleMethodsInSameClassUndefinedBehavior() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            // This enters the realm of undefined behavior, return nothing?
            public class LambdaHandler {
                public static void handleRequest(Object input) { }

                public static void handleRequest(InputStream input) { }
            }
            """
        )

        runInEdtAndWait {
            val elements = Lambda.findPsiElementsForHandler(
                fixture.project,
                Runtime.JAVA17,
                "com.example.LambdaHandler::handleRequest"
            )
            assertThat(elements).isEmpty()
        }
    }

    @Test
    fun testFindWorksInDumbMode() {
        projectRule.fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            // This enters the realm of undefined behavior, return nothing?
            public class LambdaHandler {
                public static void handleRequest(Object input) { }

                public static void handleRequest(InputStream input) { }
            }
            """
        )

        runInDumbMode {
            runInEdtAndWait {
                val elements = Lambda.findPsiElementsForHandler(
                    projectRule.project,
                    Runtime.JAVA17,
                    "com.example.LambdaHandler::handleRequest"
                )
                assertThat(elements).isEmpty()
            }
        }
    }

    @Test
    fun testDetermineHandlerWorksInDumbMode() {
        val psiClass = projectRule.fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public static void handleRequest(Object input) { }
            }
            """
        )

        runInDumbMode {
            runInEdtAndWait {
                val handler = JavaLambdaHandlerResolver()
                    .determineHandler(psiClass.findMethodsByName("handleRequest", false)[0])
                assertThat(handler).isEqualTo("com.example.LambdaHandler::handleRequest")
            }
        }
    }

    @Test
    fun testDetermineHandlersWorksInDumbMode() {
        val psiClass = projectRule.fixture.openClass(
            """
            package com.example;

            public class LambdaHandler {
                public static void handleRequest(Object input) { }
            }
            """
        )

        runInDumbMode {
            runInEdtAndWait {
                val handler = JavaLambdaHandlerResolver()
                    .determineHandlers(
                        psiClass.findMethodsByName("handleRequest", false)[0],
                        psiClass.containingFile.virtualFile
                    )
                assertThat(handler).containsExactly("com.example.LambdaHandler::handleRequest")
            }
        }
    }

    @Test
    fun handlerDisplayNames() {
        val sut = LambdaHandlerResolver.getInstance(RuntimeGroup.getById(BuiltInRuntimeGroups.Java))

        assertThat(sut.handlerDisplayName("com.example.LambdaHandler::handleRequest")).isEqualTo("LambdaHandler.handleRequest")
        assertThat(sut.handlerDisplayName("com.example.LambdaHandler")).isEqualTo("LambdaHandler")
        assertThat(sut.handlerDisplayName("LambdaHandler::handleRequest")).isEqualTo("LambdaHandler.handleRequest")
    }

    private inline fun runInDumbMode(crossinline block: () -> Unit) {
        val dumbServiceImpl = DumbService.getInstance(projectRule.project) as DumbServiceImpl
        runBlocking {
            // automatically on correct thread in 233+
            withContext(EDT) {
                dumbServiceImpl.runInDumbMode {
                    block()
                }
            }
        }
    }
}
