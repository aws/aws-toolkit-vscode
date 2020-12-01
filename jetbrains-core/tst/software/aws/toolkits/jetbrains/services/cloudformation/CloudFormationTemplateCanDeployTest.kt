// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
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
        val virtualFile = projectRule.fixture.openFile(
            "template.yaml",
            """
Resources:
  ServerlessFunction:
"""
        )

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
        val virtualFile = projectRule.fixture.openFile(
            "template.yaml",
            """
Resources:
  ServerlessFunction:
    Type: AWS::Serverless::Function
"""
        )

        runInEdtAndWait {
            assertThat(projectRule.project.validateSamTemplateHasResources(virtualFile)).isNull()
        }
    }
}
