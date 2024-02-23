// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addFileToModule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import java.nio.file.Paths

class DeploySettingsTest {

    @Rule
    @JvmField
    val projectRule = HeavyJavaCodeInsightTestFixtureRule()

    @Test
    fun relativeSamPath_root() {
        val path = Paths.get("foo.yaml").toString()
        val module = projectRule.fixture.addModule("foo")
        val file = projectRule.fixture.addFileToModule(module, path, """foo""")

        assertThat(relativeSamPath(module, file.virtualFile)).isEqualTo(path)
    }

    @Test
    fun relativeSamPath_null() {
        val fooModule = projectRule.fixture.addModule("foo")
        val barModule = projectRule.fixture.addModule("bar")
        val file = projectRule.fixture.addFileToModule(fooModule, "foo.yaml", """foo""")

        assertThat(relativeSamPath(barModule, file.virtualFile)).isNull()
    }
}
