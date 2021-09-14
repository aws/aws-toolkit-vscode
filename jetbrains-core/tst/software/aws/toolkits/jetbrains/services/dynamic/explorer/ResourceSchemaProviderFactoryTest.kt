// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.vfs.newvfs.impl.VfsRootAccess
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.runInEdtAndWait
import com.jetbrains.jsonSchema.impl.inspections.JsonSchemaComplianceInspection
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResource
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceIdentifier
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSchemaMapping
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.jetbrains.services.dynamic.ResourceType
import software.aws.toolkits.jetbrains.services.dynamic.ViewDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import java.io.File
import java.util.concurrent.CompletableFuture

class ResourceSchemaProviderFactoryTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val resource = DynamicResource(ResourceType("AWS::Logs::LogGroup", "Logs", "LogGroup"), "sampleIdentifier")

    @Test
    fun `Check whether schema is applied`() {
        VfsRootAccess.allowRootAccess(disposableRule.disposable, PathManager.getSystemPath())
        val fixture = projectRule.fixture
        val jsonSchemaComplianceInspection = JsonSchemaComplianceInspection()
        val schema = "{\n" +
            "  \"properties\": {\n" +
            "    \"RetentionInDays\": {\n" +
            "      \"description\": \"The number of days to retain the log events " +
            "in the specified log group. Possible values are: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, and 3653.\",\n" +
            "      \"type\": \"integer\",\n" +
            "      \"enum\": [\n" +
            "        1,\n" +
            "        3,\n" +
            "        5,\n" +
            "        7,\n" +
            "        14,\n" +
            "        30,\n" +
            "        60,\n" +
            "        90,\n" +
            "        120,\n" +
            "        150,\n" +
            "        180,\n" +
            "        365,\n" +
            "        400,\n" +
            "        545,\n" +
            "        731,\n" +
            "        1827,\n" +
            "        3653\n" +
            "      ]\n" +
            "    }" +
            "  }\n" +
            "}\n"

        val schemaFile = File.createTempFile("AWS::Logs::LogGroupSchema", ".json")
        schemaFile.writeText(schema)

        resourceCache.addEntry(
            projectRule.project, DynamicResources.getResourceSchema(resource.type.fullName),
            CompletableFuture.completedFuture(schemaFile)
        )

        try {
            fixture.enableInspections(jsonSchemaComplianceInspection)
            val file = ViewDynamicResourceVirtualFile(
                DynamicResourceIdentifier(ConnectionSettings(aToolkitCredentialsProvider(), anAwsRegion()), resource.type.fullName, resource.identifier),
                """
                {"RetentionInDays":<warning descr="Value should be one of: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653">18</warning>}
                """.trimIndent()
            )
            DynamicResourceSchemaMapping.getInstance().addResourceSchemaMapping(projectRule.project, file)
            runInEdtAndWait {
                fixture.openFileInEditor(file)
                fixture.checkHighlighting()
            }
        } finally {
            fixture.disableInspections(jsonSchemaComplianceInspection)
        }
    }
}
