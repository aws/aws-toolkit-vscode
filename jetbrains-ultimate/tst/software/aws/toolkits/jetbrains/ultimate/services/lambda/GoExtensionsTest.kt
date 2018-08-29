// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ultimate.services.lambda

import assertk.assert
import assertk.assertions.hasSize
import assertk.assertions.isEqualTo
import assertk.assertions.isNull
import com.goide.psi.GoFile
import com.intellij.codeInsight.daemon.GutterMark
import com.intellij.testFramework.runInEdtAndWait
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.upload.LambdaLineMarker
import software.aws.toolkits.jetbrains.testutils.rules.CodeInsightTestFixtureRule

class GoExtensionsTest {
    @Rule
    @JvmField
    val projectRule = CodeInsightTestFixtureRule()

    @Test
    fun testLineMarker() {
        val fixture = projectRule.fixture

        fixture.configureByText(
            "Hello.go",
            """
             package main

             import (
                 "github.com/aws/aws-lambda-go/lambda"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }
            """
        )

        runInEdtAndWait {
            val marks = fixture.findAllGutters().filterLambdaMarks()
            assert(marks).hasSize(1)

            val lambdaGutter = marks.first()
            val offset = lambdaGutter.lineMarkerInfo.element!!.textOffset
            val logicalPosition = fixture.editor.offsetToLogicalPosition(offset)
            assert(lambdaGutter.popupMenuActions.getChildren(null)).hasSize(1)
            assert(logicalPosition.line).isEqualTo(11)
        }
    }

    @Test
    fun testMoreThanOneMethod() {
        val fixture = projectRule.fixture

        fixture.configureByText(
            "Hello.go",
            """
             package main

             import (
                 "github.com/aws/aws-lambda-go/lambda"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }

             func main2() {
                 lambda.Start(hello)
             }
            """
        )

        runInEdtAndWait {
            assert(fixture.findAllGutters().filterLambdaMarks())
                .hasSize(1)
        }
    }

    @Test
    fun testValidHandlerName() {
        val fixture = projectRule.fixture

        val goFile = fixture.configureByText(
            "Hello.go",
            """
             package main

             import (
                 "github.com/aws/aws-lambda-go/lambda"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }
            """
        ) as GoFile

        runInEdtAndWait {
            val mainMethod = getMethod(goFile)

            assert(GoLambdaHandlerResolver().determineHandler(mainMethod)).isEqualTo("Hello")
        }
    }

    @Test
    fun testMissingImport() {
        val fixture = projectRule.fixture

        val goFile = fixture.configureByText(
            "Hello.go",
            """
             package main

             import (
                "randomImport"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }
            """
        ) as GoFile

        runInEdtAndWait {
            val mainMethod = getMethod(goFile)
            assert(GoLambdaHandlerResolver().determineHandler(mainMethod)).isNull()
        }
    }

    @Test
    fun testNonMainPackage() {
        val fixture = projectRule.fixture

        val goFile = fixture.configureByText(
            "Hello.go",
            """
             package notMain

             import (
                 "github.com/aws/aws-lambda-go/lambda"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }
            """
        ) as GoFile

        runInEdtAndWait {
            val mainMethod = getMethod(goFile)
            assert(GoLambdaHandlerResolver().determineHandler(mainMethod)).isNull()
        }
    }

    @Test
    fun testNonMainMethod() {
        val fixture = projectRule.fixture

        val goFile = fixture.configureByText(
            "Hello.go",
            """
             package main

             import (
                 "github.com/aws/aws-lambda-go/lambda"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }
            """
        ) as GoFile

        runInEdtAndWait {
            val helloMethod = getMethod(goFile, "hello")
            assert(GoLambdaHandlerResolver().determineHandler(helloMethod)).isNull()
        }
    }

    @Test
    fun testPassingWrongPsiType() {
        val fixture = projectRule.fixture

        val goFile = fixture.configureByText(
            "Hello.go",
            """
             package notMain

             import (
                 "github.com/aws/aws-lambda-go/lambda"
             )

             func hello() (string, error) {
                 return "Hello ƛ!", nil
             }

             func main() {
                 lambda.Start(hello)
             }
            """
        ) as GoFile

        runInEdtAndWait {
            assert(GoLambdaHandlerResolver().determineHandler(goFile)).isNull()
        }
    }

    private fun getMethod(goFile: GoFile, name: String = "main") = goFile.getFunctions(name).first().identifier

    private fun List<GutterMark>.filterLambdaMarks(): List<LambdaLineMarker.LambdaGutterIcon> {
        return this.filterIsInstance<LambdaLineMarker.LambdaGutterIcon>()
    }
}
