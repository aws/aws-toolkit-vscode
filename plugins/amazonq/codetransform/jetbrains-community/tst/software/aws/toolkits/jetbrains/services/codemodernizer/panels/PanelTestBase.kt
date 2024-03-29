// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import com.intellij.openapi.project.Project
import org.junit.Rule
import org.junit.jupiter.api.BeforeEach
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule

open class PanelTestBase(
    @Rule @JvmField val projectRule: CodeInsightTestFixtureRule = CodeInsightTestFixtureRule()
) {
    internal lateinit var project: Project

    @BeforeEach
    open fun setup() {
        project = projectRule.project
    }
}
