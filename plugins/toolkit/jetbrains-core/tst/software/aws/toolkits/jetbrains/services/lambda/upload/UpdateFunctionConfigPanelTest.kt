// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.iam.IamResources
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.utils.waitToLoad

class UpdateFunctionConfigPanelTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val resourceCache = MockResourceCacheRule()

    private lateinit var sut: UpdateFunctionConfigPanel
    private val role = Role.builder()
        .arn(aString())
        .assumeRolePolicyDocument(LAMBDA_PRINCIPAL)
        .build()

    @Before
    fun wireMocksTogetherWithValidOptions() {
        val project = projectRule.project

        resourceCache.addEntry(
            project,
            IamResources.LIST_RAW_ROLES,
            listOf(role)
        )

        runInEdtAndWait {
            sut = UpdateFunctionConfigPanel(project)
            sut.configSettings.handlerPanel.handler.text = "com.example.LambdaHandler::handleRequest"
            sut.configSettings.runtime.selectedItem = Runtime.JAVA21
        }

        sut.configSettings.iamRole.waitToLoad()

        runInEdtAndWait {
            sut.configSettings.iamRole.selectedItem = IamRole(role.arn())
        }
    }

    @Test
    fun `valid function returns null`() {
        runInEdtAndWait {
            assertThat(sut.validatePanel()).isNull()
        }
    }

    @Test
    fun `invalid function returns an error`() {
        runInEdtAndWait {
            sut.configSettings.handlerPanel.handler.text = ""
            assertThat(sut.validatePanel()).isNotNull
        }
    }
}
