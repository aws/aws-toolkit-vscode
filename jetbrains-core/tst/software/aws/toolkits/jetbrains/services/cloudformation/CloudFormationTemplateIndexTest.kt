// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openFile

class CloudFormationTemplateIndexTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun listFunctions_serverlessAndLambdaFunctions() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: foo
      Handler: foo::foo
      Runtime: foo
      Timeout: 800

  LambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      Code: bar
      Handler: bar::bar
      Runtime: bar
""")

        runInEdtAndWait {
            val functions = CloudFormationTemplateIndex.listFunctions(projectRule.project)
            assertThat(functions).hasSize(2)
            assertThat(functions.find { it.handler() == "foo::foo" }).isNotNull
            assertThat(functions.find { it.handler() == "bar::bar" }).isNotNull
        }
    }

    @Test
    fun listFunctions_serverlessFunction() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: serverless
      Handler: serverless::foo
      Runtime: java8
""")

        runInEdtAndWait {
            val functions = CloudFormationTemplateIndex.listFunctions(projectRule.project)
            assertThat(functions).hasSize(1)
            val indexedFunction = functions.toList()[0]
            assertThat(indexedFunction.handler()).isEqualTo("serverless::foo")
            assertThat(indexedFunction.runtime()).isEqualTo("java8")
        }
    }

    @Test
    fun listFunctions_lambdaFunction() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Lambda::Function
    Properties:
      Code: lambda
      Handler: lambda::bar
      Runtime: java8
""")

        runInEdtAndWait {
            val functions = CloudFormationTemplateIndex.listFunctions(projectRule.project)
            assertThat(functions).hasSize(1)
            val indexedFunction = functions.toList()[0]
            assertThat(indexedFunction.handler()).isEqualTo("lambda::bar")
            assertThat(indexedFunction.runtime()).isEqualTo("java8")
        }
    }

    @Test
    fun listFunctions_missingType() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type:
    Properties:
      CodeUri: target/HelloWorld-1.0.jar
      Handler: bar
      Runtime: java8
""")

        runInEdtAndWait {
            val functions = CloudFormationTemplateIndex.listFunctions(projectRule.project)
            assertThat(functions).isEmpty()
        }
    }

    @Test
    fun listResources_nullType() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Properties:
      CodeUri: target/HelloWorld-1.0.jar
      Handler: bar
      Runtime: java8
""")

        runInEdtAndWait {
            val resources = CloudFormationTemplateIndex.listResources(projectRule.project)
            assertThat(resources).isEmpty()
        }
    }

    @Test
    fun nullHandlerAndRuntime() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: target/HelloWorld-1.0.jar
""")

        runInEdtAndWait {
            val functions = CloudFormationTemplateIndex.listFunctions(projectRule.project)
            assertThat(functions).hasSize(1)
            val indexedFunction = functions.toList()[0]
            assertThat(indexedFunction.handler()).isNull()
            assertThat(indexedFunction.runtime()).isNull()
        }
    }

    @Test
    fun emptyHandlerAndRuntime() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: target/HelloWorld-1.0.jar
      Handler:
      Runtime:
""")

        runInEdtAndWait {
            val functions = CloudFormationTemplateIndex.listFunctions(projectRule.project)
            assertThat(functions).hasSize(1)
            val indexedFunction = functions.toList()[0]
            assertThat(indexedFunction.handler()).isEmpty()
            assertThat(indexedFunction.runtime()).isEmpty()
        }
    }

    @Test
    fun listResourcesByType_simpleTable() {
        val fixture = projectRule.fixture

        fixture.openFile("template.yaml", """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: baz
      Handler: foo
      Runtime: bar
      Environment:
        Variables:
          TABLE_NAME: my-table

  DynamodbTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      TableName: my-table
      PrimaryKey:
        Name: id
        Type: String
      ProvisionedThroughput:
        ReadCapacityUnits: 5
        WriteCapacityUnits: 5
      Tags:
        Department: Engineering
        AppType: Serverless
      SSESpecification:
        SSEEnabled: true
""")

        runInEdtAndWait {
            val resources = CloudFormationTemplateIndex.listResourcesByType(projectRule.project, "AWS::Serverless::SimpleTable")
            assertThat(resources).hasSize(1)
            val resource = resources.toList()[0]
            assertThat(resource.indexedProperties).isEmpty()
        }
    }
}