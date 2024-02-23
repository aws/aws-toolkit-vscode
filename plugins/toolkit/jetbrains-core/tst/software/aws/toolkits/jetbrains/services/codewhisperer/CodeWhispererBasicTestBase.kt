// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.DisposableRule
import org.junit.Rule
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

open class CodeWhispererBasicTestBase {
    @Rule
    @JvmField
    val projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()
}
