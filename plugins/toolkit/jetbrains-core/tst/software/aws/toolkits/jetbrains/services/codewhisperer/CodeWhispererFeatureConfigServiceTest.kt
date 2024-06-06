// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.codewhispererruntime.model.FeatureEvaluation
import software.amazon.awssdk.services.codewhispererruntime.model.FeatureValue
import software.amazon.awssdk.services.codewhispererruntime.model.ListFeatureEvaluationsResponse
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.CodeWhispererConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererFeatureConfigService
import kotlin.reflect.full.memberFunctions
import kotlin.test.Test

class CodeWhispererFeatureConfigServiceTest {
    @JvmField
    @Rule
    val applicationRule = ApplicationRule()

    @JvmField
    @Rule
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Test
    fun `test FEATURE_DEFINITIONS is not empty`() {
        assertThat(CodeWhispererFeatureConfigService.FEATURE_DEFINITIONS).isNotEmpty
        assertThat(CodeWhispererFeatureConfigService.FEATURE_DEFINITIONS).containsKeys("testFeature")
    }

    @Test
    fun `test customizationArnOverride returns empty for BID users`() {
        testCustomizationArnOverrideABHelper(isIdc = false, isInListAvailableCustomizations = false)
        testCustomizationArnOverrideABHelper(isIdc = false, isInListAvailableCustomizations = true)
    }

    @Test
    fun `test customizationArnOverride returns empty for IdC users if arn not in listAvailableCustomizations`() {
        testCustomizationArnOverrideABHelper(isIdc = true, isInListAvailableCustomizations = false)
    }

    @Test
    fun `test customizationArnOverride returns non-empty for IdC users if arn in listAvailableCustomizations`() {
        testCustomizationArnOverrideABHelper(isIdc = true, isInListAvailableCustomizations = true)
    }

    private fun testCustomizationArnOverrideABHelper(isIdc: Boolean, isInListAvailableCustomizations: Boolean) {
        val clientAdaptorSpy = mock<CodeWhispererClientAdaptor>()
        clientAdaptorSpy.stub {
            on { listFeatureEvaluations() } doReturn ListFeatureEvaluationsResponse.builder().featureEvaluations(
                listOf(
                    FeatureEvaluation.builder()
                        .feature(CodeWhispererFeatureConfigService.CUSTOMIZATION_ARN_OVERRIDE_NAME)
                        .variation("customizationARN")
                        .value(FeatureValue.fromStringValue("test arn"))
                        .build()
                )
            ).build()
            on { listAvailableCustomizations() } doReturn
                if (isInListAvailableCustomizations) {
                    listOf(CodeWhispererCustomization(arn = "test arn", name = "Test Arn"))
                } else {
                    emptyList()
                }
        }

        val mockSsoConnection = mock<LegacyManagedBearerSsoConnection> {
            on { this.startUrl } doReturn if (isIdc) "fake sso url" else SONO_URL
        }

        projectRule.project.replaceService(
            ToolkitConnectionManager::class.java,
            mock { on { activeConnectionForFeature(eq(CodeWhispererConnection.getInstance())) } doReturn mockSsoConnection },
            disposableRule.disposable
        )

        projectRule.project.replaceService(
            CodeWhispererClientAdaptor::class.java,
            clientAdaptorSpy,
            disposableRule.disposable
        )

        runBlocking {
            CodeWhispererFeatureConfigService.getInstance().fetchFeatureConfigs(projectRule.project)
        }

        if (!isIdc || !isInListAvailableCustomizations) {
            assertThat(CodeWhispererFeatureConfigService.getInstance().getCustomizationArnOverride()).isEqualTo("")
        } else {
            assertThat(CodeWhispererFeatureConfigService.getInstance().getCustomizationArnOverride()).isEqualTo("test arn")
        }
    }

    @Test
    fun `test service has getters for all the features`() {
        val typeMap = mapOf(
            "kotlin.Boolean" to FeatureValue.Type.BOOL_VALUE,
            "kotlin.String" to FeatureValue.Type.STRING_VALUE,
            "kotlin.Long" to FeatureValue.Type.LONG_VALUE,
            "kotlin.Double" to FeatureValue.Type.DOUBLE_VALUE,
        )
        CodeWhispererFeatureConfigService.FEATURE_DEFINITIONS.forEach { (name, context) ->
            val methodName = "get${name.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }}"

            // Find the member function with the specified name
            val method = CodeWhispererFeatureConfigService::class.memberFunctions.find { it.name == methodName }
            assertThat(method).isNotNull
            val kotlinType = method?.returnType.toString()
            assertThat(context.value.type()).isEqualTo(typeMap[kotlinType])
        }
    }
}
