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
import com.intellij.testFramework.fixtures.DefaultLightProjectDescriptor
import com.intellij.testFramework.runInEdtAndWait
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.jetbrains.testutils.rules.CodeInsightTestFixtureRule

class JavaLambdaLineMarkerTest {
    @Rule
    @JvmField
    val projectRule = CodeInsightTestFixtureRule(testDescription = DefaultLightProjectDescriptor())

    @Test
    fun singleArgumentStaticMethodsAreMarked() {
        val fixture = projectRule.fixture

        fixture.configureByText(
                "SomeClass.java",
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

    @Ignore("Can't figure out how to get the import recognized")
    fun dualArgumentStaticMethodsAreMarkedIfSecondArgIsContext() {
        val fixture = projectRule.fixture

        fixture.configureByText(
                "SomeClass.java",
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

        fixture.configureByText(
                "SomeClass.java",
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

        fixture.configureByText(
                "SomeClass.java",
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

        fixture.configureByText(
                "SomeClass.java",
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

        fixture.configureByText(
                "SomeClass.java",
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

        fixture.configureByText(
                "SomeClass.java",
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

    @Ignore("Can't figure out how to get the import recognized")
    fun classesThatImplementTheRequestHandlerInterfaceAreMarked() {
        val fixture = projectRule.fixture

        val concrete = "ConcreteHandler.java".asTestFile()
        val abstract = "AbstractHandler.java".asTestFile()

        fixture.configureByFiles(concrete, abstract)

        findAndAssertMarks(fixture) {
            assert(it).hasSize(1)
            assert(it.first().lineMarkerInfo.element).isIdentifierWithName("ConcreteHandler")
        }
    }

    private fun findAndAssertMarks(fixture: CodeInsightTestFixture, assertion: (List<LambdaLineMarker.LambdaGutterIcon>) -> Unit) {
        runInEdtAndWait {
            val marks = fixture.findAllGutters().filterIsInstance<LambdaLineMarker.LambdaGutterIcon>()
            assertion(marks)
        }
    }

    private fun String.asTestFile() = javaClass.getResource("/software/aws/toolkits/jetbrains/services/lambda/lineMarkerTestFiles/$this")?.file ?: throw IllegalArgumentException("File $this not found")

    private fun Assert<PsiElement?>.isIdentifierWithName(name: String) {
        this.isNotNull {
            it.isInstanceOf(PsiIdentifier::class)
            assert(it.actual.text).isEqualTo(name)
        }
    }
}