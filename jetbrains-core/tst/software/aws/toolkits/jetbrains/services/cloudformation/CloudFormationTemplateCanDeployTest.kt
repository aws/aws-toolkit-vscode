// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openFile
import software.aws.toolkits.resources.message

class CloudFormationTemplateCanDeployTest {

    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun deployable() {
        val virtualFile = projectRule.fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: foo::foo
      Runtime: python3.6

  LambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Code: bar
      Handler: bar::bar
      Runtime: python2.7
""")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateLambdaRuntimes(virtualFile)).isNull()
        }
    }

    @Test
    fun notDeployable_unknownRuntimes() {
        val virtualFile = projectRule.fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: foo::foo
      Runtime: foo
""")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateLambdaRuntimes(virtualFile)).isEqualTo(
                message("serverless.application.deploy.error.invalid_runtime", "foo", virtualFile.path))
        }
    }

    @Test
    @Ignore("All supported runtimes are deployable now")
    fun notDeployable_notSupportedRuntimes() {
        val virtualFile = projectRule.fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: foo::foo
      Runtime: python3.6

  LambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Code: bar
      Handler: bar::bar
      Runtime: java8
""")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateLambdaRuntimes(virtualFile)).isEqualTo(
                message("serverless.application.deploy.error.unsupported_runtime_group", "java8", virtualFile.path))
        }
    }

    @Test
    @Ignore("All supported runtimes are deployable now")
    fun multipleTemplates() {
        val virtualFile1 = projectRule.fixture.openFile("template1.yaml", """
Resources:
  LambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Code: bar
      Handler: bar::bar
      Runtime: java8
""")
        val virtualFile2 = projectRule.fixture.openFile("template2.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: foo::foo
      Runtime: python3.6
""")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateLambdaRuntimes(virtualFile1)).isEqualTo(
                message("serverless.application.deploy.error.unsupported_runtime_group", "java8", virtualFile1.path))
            assertThat(projectRule.project.validateSamTemplateLambdaRuntimes(virtualFile2)).isNull()
        }
    }

    @Test
    fun nonDeployable_emptyFile() {
        val virtualFile = projectRule.fixture.openFile("template.yaml", "")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateHasResources(virtualFile)).isEqualTo(
                message(
                    "serverless.application.deploy.error.no_resources",
                    virtualFile.path
                )
            )
        }
    }

    @Test
    fun nonDeployable_incompleteResources() {
        val virtualFile = projectRule.fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
""")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateHasResources(virtualFile)).isEqualTo(
                message(
                    "serverless.application.deploy.error.no_resources",
                    virtualFile.path
                )
            )
        }
    }

    @Test
    fun deployable_validatableEnough() {
        val virtualFile = projectRule.fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
""")

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateHasResources(virtualFile)).isNull()
        }
    }
}
