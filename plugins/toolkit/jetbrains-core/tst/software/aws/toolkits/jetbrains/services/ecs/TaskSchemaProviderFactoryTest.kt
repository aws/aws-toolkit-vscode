// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.vfs.impl.http.HttpVirtualFile
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import com.jetbrains.jsonSchema.impl.inspections.JsonSchemaComplianceInspection
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.openFile
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TaskSchemaProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Test
    fun testSchemaIsApplied() {
        VfsRootAccess.allowRootAccess(disposableRule.disposable, PathManager.getSystemPath())

        val fixture = projectRule.fixture

        val jsonSchemaComplianceInspection = JsonSchemaComplianceInspection()
        try {
            fixture.enableInspections(jsonSchemaComplianceInspection)

            fixture.openFile(
                "ecs-task-def.json",
                """
                <warning descr="Missing required properties 'containerDefinitions', 'family'">{}</warning>
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

            wait.await(5, TimeUnit.SECONDS)

            runInEdtAndWait {
                fixture.checkHighlighting()
            }
        } finally {
            fixture.disableInspections(jsonSchemaComplianceInspection)
        }
    }
}
