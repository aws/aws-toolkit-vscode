// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.vfs.impl.http.HttpVirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import org.jetbrains.yaml.schema.YamlJsonSchemaHighlightingInspection
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openFile
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class DevFileSchemaProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Test
    fun testSchemaIsApplied() {
        VfsRootAccess.allowRootAccess(disposableRule.disposable, PathManager.getSystemPath())
        val yamlJsonSchemaHighlightingInspection = YamlJsonSchemaHighlightingInspection()
        val fixture = projectRule.fixture

        try {
            fixture.enableInspections(yamlJsonSchemaHighlightingInspection)

            fixture.openFile(
                "devfile.yaml",
                """
                <warning descr="Schema validation: Missing required property 'schemaVersion'"> </warning>
                """.trimIndent()
            )

            val schemaService = JsonSchemaService.Impl.get(projectRule.project)

            // Get the schema and force the download since the framework disables HTTP based schemas
            val schemas = runInEdtAndGet {
                schemaService.getSchemaFilesForFile(fixture.file.virtualFile)
            }

            val wait = CountDownLatch(schemas.size)
            schemas.filterIsInstance<HttpVirtualFile>().forEach {
                it.refresh(false, false) {
                    wait.countDown()
                }
            }

            assert(wait.await(5, TimeUnit.SECONDS)).equals(true)
            runInEdtAndWait {
                fixture.checkHighlighting()
            }
        } finally {
            fixture.disableInspections(yamlJsonSchemaHighlightingInspection)
        }
    }
}
