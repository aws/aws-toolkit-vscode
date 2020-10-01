// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.projectRoots.ProjectJdkTable
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.testFramework.IdeaTestUtil
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.iam.IamClient
import software.amazon.awssdk.services.iam.model.ListRolesRequest
import software.amazon.awssdk.services.iam.model.ListRolesResponse
import software.amazon.awssdk.services.iam.model.Role
import software.amazon.awssdk.services.iam.paginators.ListRolesIterable
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaHandlerResolver
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.settings.UpdateLambdaSettings
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.waitForFalse

class EditFunctionDialogTest {

    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @JvmField
    @Rule
    val mockResourceCache = MockResourceCacheRule(projectRule)

    private val mockSettingsManager by lazy { AwsConnectionManager.getInstance(projectRule.project) as MockAwsConnectionManager }

    private lateinit var s3Client: S3Client
    private lateinit var iamClient: IamClient

    @Before
    fun setup() {
        s3Client = mockClientManager.create()
        iamClient = mockClientManager.create()
        mockSettingsManager.changeRegion(AwsRegion("us-west-1", "US West 1", "aws"))

        val sdk = IdeaTestUtil.getMockJdk18()
        runInEdtAndWait {
            runWriteAction {
                ProjectJdkTable.getInstance().addJdk(sdk, projectRule.fixture.projectDisposable)
                ProjectRootManager.getInstance(projectRule.project).projectSdk = sdk
            }
        }
    }

    @Test
    fun `On new and update code, dialog only shows runtimes we can build`() {
        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.NEW)
        }
        assertThat(dialog.getViewForTestAssertions().runtime.model.size).isEqualTo(LambdaHandlerResolver.supportedRuntimeGroups().flatMap { it.runtimes }.size)
        assertThat(dialog.getViewForTestAssertions().runtime.model.size).isNotEqualTo(Runtime.knownValues().size)

        val dialog2 = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CODE)
        }
        assertThat(dialog2.getViewForTestAssertions().runtime.model.size).isEqualTo(LambdaHandlerResolver.supportedRuntimeGroups().flatMap { it.runtimes }.size)
        assertThat(dialog2.getViewForTestAssertions().runtime.model.size).isNotEqualTo(Runtime.knownValues().size)
    }

    @Test
    fun `Loads saved settings if function name matches`() {
        mockBuckets()

        val arn = RuleUtils.randomName()
        val settings = UpdateLambdaSettings.getInstance(arn)

        settings.bucketName = "hello2"
        settings.useContainer = true

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CODE, arn = arn)
        }
        dialog.getViewForTestAssertions().sourceBucket.waitToLoad()
        assertThat(dialog.getViewForTestAssertions().buildInContainer.isSelected).isEqualTo(true)
        assertThat(dialog.getViewForTestAssertions().sourceBucket.selectedItem?.toString()).isEqualTo("hello2")
    }

    @Test
    fun `Does not load saved settings if function name does not match`() {
        mockBuckets()

        val arn = RuleUtils.randomName()
        val settings = UpdateLambdaSettings.getInstance(arn)

        settings.bucketName = "hello2"
        settings.useContainer = true

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CODE, arn = "not$arn")
        }
        dialog.getViewForTestAssertions().sourceBucket.waitToLoad()
        assertThat(dialog.getViewForTestAssertions().buildInContainer.isSelected).isEqualTo(false)
        assertThat(dialog.getViewForTestAssertions().sourceBucket.selectedItem).isNull()
    }

    @Test
    fun `On update configuration, dialog shows all runtimes`() {
        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CONFIGURATION)
        }
        assertThat(dialog.getViewForTestAssertions().runtime.model.size).isNotEqualTo(
            LambdaHandlerResolver.supportedRuntimeGroups().flatMap { it.runtimes }.size
        )
        assertThat(dialog.getViewForTestAssertions().runtime.model.size).isEqualTo(Runtime.knownValues().size)
    }

    @Test
    fun newShowsConfigurationDeploymentAndBuildSettings() {
        mockRoles()

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.NEW)
        }

        assertThat(dialog.getViewForTestAssertions().configurationSettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().deploySettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().buildSettings.isVisible).isTrue()
    }

    @Test
    fun updateConfigurationShowsOnlyConfigurationSettings() {
        mockRoles()

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CONFIGURATION)
        }

        assertThat(dialog.getViewForTestAssertions().configurationSettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().deploySettings.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().buildSettings.isVisible).isFalse()
    }

    @Test
    fun updateCodeShowsOnlyDeploymentSettingsHandlerAndBuild() {
        mockRoles()

        val dialog = runInEdtAndGet {
            EditFunctionDialog(project = projectRule.project, mode = EditFunctionMode.UPDATE_CODE)
        }

        assertThat(dialog.getViewForTestAssertions().deploySettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().buildSettings.isVisible).isTrue()
        assertThat(dialog.getViewForTestAssertions().handlerPanel.handler.isVisible).isTrue()

        assertThat(dialog.getViewForTestAssertions().buildInContainer.isVisible).isTrue()

        assertThat(dialog.getViewForTestAssertions().name.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().description.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().iamRole.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().createRole.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().runtime.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().envVars.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().timeoutSlider.isVisible).isFalse()
        assertThat(dialog.getViewForTestAssertions().memorySlider.isVisible).isFalse()
    }

    private fun mockBuckets() {
        mockResourceCache.get().addEntry(
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            listOf(
                S3Resources.RegionalizedBucket(Bucket.builder().name("hello").build(), mockSettingsManager.activeRegion),
                S3Resources.RegionalizedBucket(Bucket.builder().name("hello2").build(), mockSettingsManager.activeRegion)
            )
        )
    }

    private fun mockRoles() {
        whenever(iamClient.listRolesPaginator(any<ListRolesRequest>())).thenAnswer { a ->
            ListRolesIterable(
                iamClient,
                a.arguments.first() as ListRolesRequest
            )
        }
        whenever(iamClient.listRoles(any<ListRolesRequest>())).thenReturn(
            ListRolesResponse.builder().roles(
                Role.builder().arn("abc123").assumeRolePolicyDocument(
                    LAMBDA_PRINCIPAL
                ).build()
            ).isTruncated(false).build()
        )
    }

    private fun ResourceSelector<*>.waitToLoad() {
        runBlocking {
            waitForFalse { isLoading }
        }
    }
}
