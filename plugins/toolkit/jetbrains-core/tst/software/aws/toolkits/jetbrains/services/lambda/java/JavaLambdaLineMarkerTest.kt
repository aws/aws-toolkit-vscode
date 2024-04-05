// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.psi.PsiIdentifier
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.jetbrains.settings.LambdaSettings
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openClass
import software.aws.toolkits.jetbrains.utils.rules.openFile

class JavaLambdaLineMarkerTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Before
    fun setUp() {
        LambdaSettings.getInstance(projectRule.project).showAllHandlerGutterIcons = true
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

    @After
    fun tearDown() {
        MockAwsConnectionManager.getInstance(projectRule.project).reset()
    }

    @Test
    fun singleArgumentStaticMethodsAreMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            public class UsefulUtils {

                private UsefulUtils() { }

                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "upperCase")
        }
    }

    @Test
    fun singleArgumentStaticMethodsAreNotMarkedWhenDisablingLambdaSetting() {
        val fixture = projectRule.fixture
        LambdaSettings.getInstance(projectRule.project).showAllHandlerGutterIcons = false

        fixture.openClass(
            """
            package com.example;

            public class UsefulUtils {

                private UsefulUtils() { }

                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun singleArgumentStaticMethodsMarkedWhenDisablingLambdaSettingButDefinedInTemplate() {
        val fixture = projectRule.fixture
        LambdaSettings.getInstance(projectRule.project).showAllHandlerGutterIcons = false

        fixture.openFile(
            "template.yaml",
            """
Resources:
  UpperCase:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: com.example.UsefulUtils::upperCase
      Runtime: java21
"""
        )

        fixture.openClass(
            """
            package com.example;

            public class UsefulUtils {

                private UsefulUtils() { }

                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "upperCase")
        }
    }

    @Test
    fun singleArgumentStaticMethodsMarkedWhenDisablingLambdaSettingButDefinedInTemplateGlobals() {
        val fixture = projectRule.fixture
        LambdaSettings.getInstance(projectRule.project).showAllHandlerGutterIcons = false

        fixture.openFile(
            "template.yaml",
            """
Globals:
  Function:
    Handler: com.example.UsefulUtils::upperCase
    Runtime: java21
Resources:
  UpperCase:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
"""
        )

        fixture.openClass(
            """
            package com.example;

            public class UsefulUtils {

                private UsefulUtils() { }

                public static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "upperCase")
        }
    }

    @Test
    fun dualArgumentStaticMethodsAreMarkedIfSecondArgIsContext() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class UsefulUtils {

                private UsefulUtils() { }

                public static String upperCase(String input, Context context) {
                    return input.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "upperCase")
        }
    }

    @Test
    fun singleArgumentPublicMethodsOnClassesWithNoArgConstructorAreMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 public UsefulUtils() { }

                 public String upperCase(String input) {
                     return input.toUpperCase();
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "upperCase")
        }
    }

    @Test
    fun singleArgumentPublicMethodsOnClassesWithNoConstructorAreMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 public String upperCase(String input) {
                     return input.toUpperCase();
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "upperCase")
        }
    }

    @Test
    fun privateMethodsAreNotMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 private String upperCase(String input) {
                     return input.toUpperCase();
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun constructorAreNotMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 public UsefulUtils() {}

                 public UsefulUtils(String abc) {
                     System.out.println(abc);
                 }

                 private String upperCase(String input) {
                     return input.toUpperCase();
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun javaMainMethodIsNotMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 public static void main(String[] args) {
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun privateStaticMethodsAreNotMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
            package com.example;

            public class UsefulUtils {

                private static String upperCase(String input) {
                    return input.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun dualArgumentStaticMethodsAreNotMarked() {
        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 private UsefulUtils() { }

                 public static String upperCase(String input, String secondArgument) {
                     return input.toUpperCase();
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun classesThatImplementTheRequestHandlerInterfaceAreMarked() {
        val fixture = projectRule.fixture

        fixture.addClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.RequestHandler;

            public abstract class AbstractHandler implements RequestHandler<String, String> { }
            """
        )

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public class ConcreteHandler extends AbstractHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "ConcreteHandler")
        }
    }

    @Test
    fun classesThatImplementTheRequestHandlerInterfaceAreNotMarkedIfAbstract() {
        val fixture = projectRule.fixture

        fixture.addClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.RequestHandler;

            public abstract class AbstractHandler implements RequestHandler<String, String> { }
            """
        )

        fixture.openClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.Context;

            public abstract class ConcreteHandler extends AbstractHandler {
                public String handleRequest(String request, Context context) {
                    return request.toUpperCase();
                }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    @Test
    fun classesThatImplementTheRequestStreamHandlerInterfaceAreMarked() {
        val fixture = projectRule.fixture

        fixture.addClass(
            """
            package com.example;

            import com.amazonaws.services.lambda.runtime.RequestStreamHandler;

            public abstract class AbstractHandler implements RequestStreamHandler { }
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
                public void handleRequest(InputStream input, OutputStream output, Context context) { }
            }
            """
        )

        findAndAssertMarks(fixture) { marks ->
            assertLineMarkerIs(marks, "ConcreteHandler")
        }
    }

    @Test
    fun noCredentialsLeadsToNoMarkerIfNoOtherCriteriaPasses() {
        LambdaSettings.getInstance(projectRule.project).showAllHandlerGutterIcons = false
        MockAwsConnectionManager.getInstance(projectRule.project).nullifyCredentialProviderAndWait()

        val fixture = projectRule.fixture

        fixture.openClass(
            """
             package com.example;

             public class UsefulUtils {

                 public String upperCase(String input) {
                     return input.toUpperCase();
                 }
             }
             """
        )

        findAndAssertMarks(fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    private fun findAndAssertMarks(fixture: CodeInsightTestFixture, assertion: (List<LambdaLineMarker.LambdaGutterIcon>) -> Unit) {
        runInEdtAndWait {
            val marks = fixture.findAllGutters().filterIsInstance<LambdaLineMarker.LambdaGutterIcon>()
            assertion(marks)
        }
    }

    private fun assertLineMarkerIs(marks: List<LambdaLineMarker.LambdaGutterIcon>, elementName: String) {
        assertThat(marks).hasSize(1)
        assertThat(marks.first().lineMarkerInfo.element)
            .isInstanceOf(PsiIdentifier::class.java)
            .extracting { it?.text }
            .isEqualTo(elementName)
    }
}
