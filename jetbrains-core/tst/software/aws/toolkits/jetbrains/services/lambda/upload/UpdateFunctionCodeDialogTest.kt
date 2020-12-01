// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.upload

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.PackageType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.s3.model.Bucket
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.iam.IamRole
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunction
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources
import software.aws.toolkits.jetbrains.settings.UpdateLambdaSettings
import software.aws.toolkits.jetbrains.utils.waitToLoad

class UpdateFunctionCodeDialogTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule()

    @JvmField
    @Rule
    val mockResourceCache = MockResourceCacheRule()

    @Test
    fun `Loads saved settings if function arn matches`() {
        mockBuckets()

        val arn = aString()
        val settings = UpdateLambdaSettings.getInstance(arn)

        settings.bucketName = "hello2"
        settings.useContainer = true

        val dialog = runInEdtAndGet {
            UpdateFunctionCodeDialog(project = projectRule.project, initialSettings = aLambdaFunction().copy(arn = arn))
        }
        dialog.getViewForTestAssertions().codeStorage.sourceBucket.waitToLoad()

        retryableAssert {
            assertThat(dialog.getViewForTestAssertions().buildSettings.buildInContainerCheckbox.isSelected).isEqualTo(true)
            assertThat(dialog.getViewForTestAssertions().codeStorage.sourceBucket.selectedItem?.toString()).isEqualTo("hello2")
        }
    }

    @Test
    fun `Does not load saved settings if function arn does not match`() {
        mockBuckets()

        val arn = RuleUtils.randomName()
        val settings = UpdateLambdaSettings.getInstance(arn)

        settings.bucketName = "hello2"
        settings.useContainer = true

        val dialog = runInEdtAndGet {
            UpdateFunctionCodeDialog(project = projectRule.project, initialSettings = aLambdaFunction().copy(arn = "not$arn"))
        }
        dialog.getViewForTestAssertions().codeStorage.sourceBucket.waitToLoad()

        retryableAssert {
            assertThat(dialog.getViewForTestAssertions().buildSettings.buildInContainerCheckbox.isSelected).isEqualTo(false)
            assertThat(dialog.getViewForTestAssertions().codeStorage.sourceBucket.selectedItem?.toString()).isNull()
        }
    }

    private fun mockBuckets() {
        val region = projectRule.project.activeRegion()

        mockResourceCache.addEntry(
            projectRule.project,
            S3Resources.LIST_REGIONALIZED_BUCKETS,
            listOf(
                S3Resources.RegionalizedBucket(Bucket.builder().name("hello").build(), region),
                S3Resources.RegionalizedBucket(Bucket.builder().name("hello2").build(), region)
            )
        )
    }

    private fun aLambdaFunction() = LambdaFunction(
        name = aString(),
        description = aString(),
        packageType = PackageType.ZIP,
        arn = aString(),
        lastModified = "",
        handler = aString(),
        runtime = Runtime.UNKNOWN_TO_SDK_VERSION,
        timeout = 1,
        memorySize = 1,
        xrayEnabled = false,
        role = IamRole(aString()),
        envVariables = emptyMap()
    )
}
