// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.Disposable
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.Disposer
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass

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
                .contains("com.example.LambdaHandler::handleRequest")
        }
    }

    @Test
    fun testHandlerIsReturned_customMethodInRequestHandlerImplementation() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import com.amazonaws.services.lambda.runtime.RequestHandler;

            public class LambdaHandler implements RequestHandler<String, String> {

                @Override
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }

                public String customHandleRequest(String request, Context context) {
                    return request.toLowerCase();
                }
            }
            """
        )

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                    .contains("com.example.LambdaHandler")
                    .contains("com.example.LambdaHandler::customHandleRequest")
                    .doesNotContain("com.example.LambdaHandler::handleRequest")
        }
    }

    @Test
    fun testStreamHandlerIsReturned() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import java.io.InputStream;
            import java.io.OutputStream;
            import java.io.IOException;

            public class StreamLambdaHandler {
                public static void handleRequest(InputStream input, OutputStream output, Context context) throws IOException;
            }
            """
        )

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                    .contains("com.example.StreamLambdaHandler::handleRequest")
        }
    }

    @Test
    fun testStreamHandlerIsReturned_customMethodInStreamRequestHandlerImplementation() {
        val fixture = projectRule.fixture

        val psiClass = fixture.addClass("""
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import com.amazonaws.services.lambda.runtime.RequestStreamHandler;
            import java.io.InputStream;
            import java.io.OutputStream;
            import java.io.IOException;

            public class StreamLambdaHandler implements RequestStreamHandler {

                @Override
                public void handleRequest(InputStream input, OutputStream output, Context context) throws IOException {}

                public String customHandleRequest(String request, Context context) {
                    return request.toLowerCase();
                }
            }
            """)

        runInEdtAndWait {
            fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                    .contains("com.example.StreamLambdaHandler")
                    .contains("com.example.StreamLambdaHandler::customHandleRequest")
                    .doesNotContain("com.example.StreamLambdaHandler::handleRequest")
        }
    }

    @Test
    fun testHandlerIsReturned_fromSuperClass() {
        val fixture = projectRule.fixture
        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;
            import com.amazonaws.services.lambda.runtime.RequestHandler;

            public abstract class AbstractClass implements RequestHandler<String, String> {

                @Override
                public String handleRequest(String request, Context context) {
                    return internalHandleRequest(request, context);
                }

                public String customHandleRequest(String request, Context context) {
                    return internalHandleRequest(request, context);
                }

                protected abstract String internalHandleRequest(String request, Context context);
            }
            """
        )

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class ConcreteClass extends AbstractClass {

                @Override
                private String internalHandleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project))
                    .contains("com.example.ConcreteClass")
                    .contains("com.example.ConcreteClass::customHandleRequest")
                    .doesNotContain("com.example.ConcreteClass::handleRequest")
                    .doesNotContain("com.example.AbstractClass")
                    .doesNotContain("com.example.AbstractClass::handleRequest")
                    .doesNotContain("com.example.AbstractClass::customHandleRequest")
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
                .contains("com.example.LambdaHandler::handleRequest")
        }

        WriteCommandAction.runWriteCommandAction(fixture.project) {
            psiClass.containingFile.virtualFile.delete(null)
        }

        runInEdtAndWait {
            assertThat(LambdaHandlerIndex.listHandlers(projectRule.project)).isEmpty()
        }
    }

    @Test
    @Suppress("DEPRECATION")
    fun testVersionChangesIfExtensionsChange() {
        val initialVersion = LambdaHandlerIndex().version

        val extensionPointName = ExtensionPointName.create<RuntimeGroupExtensionPoint<LambdaHandlerResolver>>("aws.toolkit.lambda.handlerResolver")
        val extensionPoint = extensionPointName.getPoint(null)
        val extensions = extensionPoint.extensions

        Disposer.register(projectRule.fixture.testRootDisposable, Disposable {
            extensions.forEach { extensionPoint.registerExtension(it) }
        })

        extensions.forEach { extensionPoint.unregisterExtension(it) }

        val newVersion = LambdaHandlerIndex().version

        assertThat(initialVersion).isNotEqualTo(newVersion)
    }
}
