// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.execution.template

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.jetbrains.yaml.psi.YAMLFile
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.lambda.sam.findByLocation
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

class YamlLambdaRunLineMarkerContributorTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    val sut = YamlLambdaRunLineMarkerContributor()

    @Test
    fun `finds AWS-Lambda-Function`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "template.yaml",
                // language=YAML
                """
                Resources:
                  Function:
                    Type: AWS::Lambda::Function
                    Properties:
                      Code: foo.zip
                      Handler: foobar.App::handleRequest
                      Runtime: java8
                """.trimIndent()
            ) as YAMLFile
            val psiElement = psiFile.findByLocation("Resources.Function")?.key ?: throw RuntimeException("Can't find function")

            assertThat(sut.getInfo(psiElement)).isNotNull
        }
    }

    @Test
    fun `finds AWS-Serverless-Function`() {
        runInEdtAndWait {
            val psiFile = projectRule.fixture.configureByText(
                "template.yaml",
                // language=YAML
                """
                Resources:
                  Function:
                    Type: AWS::Serverless::Function
                    Properties:
                      Code: foo.zip
                      Handler: foobar.App::handleRequest
                      Runtime: java8
                """.trimIndent()
            ) as YAMLFile
            val psiElement = psiFile.findByLocation("Resources.Function")?.key ?: throw RuntimeException("Can't find function")

            assertThat(sut.getInfo(psiElement)).isNotNull
        }
    }
}
