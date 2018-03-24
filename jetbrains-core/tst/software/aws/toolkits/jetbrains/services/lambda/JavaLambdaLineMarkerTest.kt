package software.aws.toolkits.jetbrains.services.lambda

import assertk.Assert
import assertk.assert
import assertk.assertions.hasSize
import assertk.assertions.isEmpty
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotNull
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiIdentifier
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.fixtures.JavaCodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import org.intellij.lang.annotations.Language
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.jetbrains.testutils.rules.JavaCodeInsightTestFixtureRule

class JavaLambdaLineMarkerTest {
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
            assert(marks).hasSize(1)
            assert(marks.first().lineMarkerInfo.element).isIdentifierWithName("upperCase")
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
            assert(marks).hasSize(1)
            assert(marks.first().lineMarkerInfo.element).isIdentifierWithName("upperCase")
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
            assert(marks).hasSize(1)
            assert(marks.first().lineMarkerInfo.element).isIdentifierWithName("upperCase")
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
            assert(marks).hasSize(1)
            assert(marks.first().lineMarkerInfo.element).isIdentifierWithName("upperCase")
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

        findAndAssertMarks(fixture) { assert(it).isEmpty() }
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

        findAndAssertMarks(fixture) { assert(it).isEmpty() }
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

        findAndAssertMarks(fixture) { assert(it).hasSize(0) }
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

        findAndAssertMarks(fixture) {
            assert(it).hasSize(1)
            assert(it.first().lineMarkerInfo.element).isIdentifierWithName("ConcreteHandler")
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

        findAndAssertMarks(fixture) { assert(it).hasSize(0) }
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

        findAndAssertMarks(fixture) {
            assert(it).hasSize(1)
            assert(it.first().lineMarkerInfo.element).isIdentifierWithName("ConcreteHandler")
        }
    }

    private fun findAndAssertMarks(
        fixture: CodeInsightTestFixture,
        assertion: (List<LambdaLineMarker.LambdaGutterIcon>) -> Unit
    ) {
        runInEdtAndWait {
            val marks = fixture.findAllGutters().filterIsInstance<LambdaLineMarker.LambdaGutterIcon>()
            assertion(marks)
        }
    }

    private fun Assert<PsiElement?>.isIdentifierWithName(name: String) {
        this.isNotNull {
            it.isInstanceOf(PsiIdentifier::class)
            assert(it.actual.text).isEqualTo(name)
        }
    }

    private fun JavaCodeInsightTestFixture.openClass(@Language("JAVA") javaClass: String) {
        val psiClass = this.addClass(javaClass)
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(psiClass.containingFile.virtualFile)
        }
    }
}
