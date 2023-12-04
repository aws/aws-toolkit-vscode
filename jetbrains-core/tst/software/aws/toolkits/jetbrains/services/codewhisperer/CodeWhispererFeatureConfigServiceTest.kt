// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import software.amazon.awssdk.services.codewhispererruntime.model.FeatureValue
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

    @Test
    fun `test FEATURE_DEFINITIONS is not empty`() {
        assertThat(CodeWhispererFeatureConfigService.FEATURE_DEFINITIONS).isNotEmpty
        assertThat(CodeWhispererFeatureConfigService.FEATURE_DEFINITIONS).containsKeys("testFeature")
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
