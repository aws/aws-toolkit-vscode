// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.template

import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.psi.PsiElement
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openFile

class LambdaRunLineMarkerContributorTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun testServerlessFunctionIsMarked() {
        projectRule.fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: target/HelloWorld-1.0.jar
      Handler: helloworld.ConcreteClass::handleRequest
      Runtime: java8
""")

        runAndAssertionMarks(projectRule.fixture) { marks ->
            assertThat(marks).hasSize(1)
            assertThat(marks.first().lineMarkerInfo.element).isNotNull.satisfies {
                assertThat(it!!.text).isEqualTo("ServerlessFunction")
            }
        }
    }

    @Test
    fun testLambdaFunctionIsMarked() {
        projectRule.fixture.openFile("template.yaml", """
Resources:
  LambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      CodeUri: target/HelloWorld-1.0.jar
      Handler: helloworld.ConcreteClass::handleRequest
      Runtime: java8
""")
        runAndAssertionMarks(projectRule.fixture) { marks ->
            assertThat(marks).hasSize(1)
            assertThat(marks.first().lineMarkerInfo.element).isNotNull.satisfies {
                assertThat(it!!.text).isEqualTo("LambdaFunction")
            }
        }
    }

    @Test
    fun testEmptyMarks() {
        projectRule.fixture.openFile("template.yaml", """
Resources:
  FooApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      DefinitionUri: swagger.yml
""")
        runAndAssertionMarks(projectRule.fixture) { marks ->
            assertThat(marks).isEmpty()
        }
    }

    private fun runAndAssertionMarks(fixture: CodeInsightTestFixture, assertion: (List<LineMarkerInfo.LineMarkerGutterIconRenderer<PsiElement>>) -> Unit) {
        runInEdtAndWait {
            val marks = fixture.findAllGutters().filterIsInstance<LineMarkerInfo.LineMarkerGutterIconRenderer<PsiElement>>()
            assertion(marks)
        }
    }
}
