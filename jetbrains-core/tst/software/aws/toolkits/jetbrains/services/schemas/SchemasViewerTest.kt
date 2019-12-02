// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import java.io.File
import java.util.concurrent.CompletableFuture

class SchemasViewerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    var errorNotification: Notification? = null

    private val fileEditorManager = FileEditorManager.getInstance(projectRule.project)

    val CREDENTIAL_IDENTIFIER = MockProjectAccountSettingsManager.MOCK_CREDENTIALS_NAME
    val REGION = MockProjectAccountSettingsManager.getInstance(projectRule.project).activeRegion.id
    val REGISTRY = "registry"
    val SCHEMA = "schema"
    val VERSION = "2"

    val SCHEMA_FILE_NAME = "$CREDENTIAL_IDENTIFIER.$REGION.$REGISTRY.$SCHEMA.$VERSION.json"

    val AWS_EVENT_SCHEMA_RAW = File(javaClass.getResource("/awsEventSchemaRaw.json.txt").toURI()).readText(Charsets.UTF_8)
    val AWS_EVENT_SCHEMA_PRETTY = File(javaClass.getResource("/awsEventSchemaPretty.json.txt").toURI()).readText(Charsets.UTF_8)

    @Before
    fun setUp() {
        subscribeToNotifications()
    }

    @After
    fun cleanUp() {
        runInEdtAndWait {
            fileEditorManager.openFiles.forEach { fileEditorManager.closeFile(it) }
        }
        errorNotification = null
    }

    @Test
    fun canGetSchemaContent() {
        val schemaResponse = DescribeSchemaResponse.builder()
            .content(AWS_EVENT_SCHEMA_RAW)
            .build()
        resourceCache().mockSchemaCache(
            REGISTRY, SCHEMA, schemaResponse
        )

        val actualReponse = SchemaDownloader().getSchemaContent(REGISTRY, SCHEMA, project = projectRule.project)
            .toCompletableFuture().get()

        assertThat(actualReponse).isEqualTo(schemaResponse)
    }

    @Test
    fun canPrettyPrintSchemaContent() {
        val prettySchema = SchemaFormatter().prettySchemaContent(AWS_EVENT_SCHEMA_RAW).toCompletableFuture().get()

        assertThat(prettySchema.trim()).isEqualToNormalizingNewlines(AWS_EVENT_SCHEMA_PRETTY.trim())
    }

    @Test
    fun canOpenFileDialog() {
        var future = CompletableFuture<Void>()
        runInEdtAndWait() {
            future = SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project).toCompletableFuture()
        }

        future.get()

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(SCHEMA_FILE_NAME) }
    }

    @Test
    fun canDownloadAndViewSchema() {
        val schema = DescribeSchemaResponse.builder()
            .content(AWS_EVENT_SCHEMA_RAW)
            .schemaName(SCHEMA)
            .schemaVersion(VERSION)
            .build()
        resourceCache().mockSchemaCache(
            REGISTRY, SCHEMA,
            schema
        )

        val mockSchemaDownloader = mockk<SchemaDownloader>()
        val mockSchemaFormatter = mockk<SchemaFormatter>()
        val mockSchemaPreviewer = mockk<SchemaPreviewer>()
        every { mockSchemaDownloader.getSchemaContent(REGISTRY, SCHEMA, project = projectRule.project) } returns completableFutureOf(schema)
        every { mockSchemaFormatter.prettySchemaContent(AWS_EVENT_SCHEMA_RAW) } returns completableFutureOf(AWS_EVENT_SCHEMA_PRETTY)
        every { mockSchemaPreviewer.openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project) } returns
            completableFutureOf(null)

        runInEdtAndWait() {
            SchemaViewer(projectRule.project, mockSchemaDownloader, mockSchemaFormatter, mockSchemaPreviewer)
                .downloadAndViewSchema(SCHEMA, REGISTRY)
        }

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify { mockSchemaDownloader.getSchemaContent(REGISTRY, SCHEMA, project = projectRule.project) }
        verify { mockSchemaFormatter.prettySchemaContent(AWS_EVENT_SCHEMA_RAW) }
        verify { mockSchemaPreviewer.openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project) }
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.mockSchemaCache(registryName: String, schemaName: String, schema: DescribeSchemaResponse) {
        this.addEntry(
            SchemasResources.getSchema(registryName, schemaName),
            CompletableFuture.completedFuture(schema))
    }

    fun subscribeToNotifications() {
        val project = projectRule.project

        val messageBus = project.messageBus.connect()

        messageBus.setDefaultHandler { _, params ->
            errorNotification = params[0] as Notification
        }
        messageBus.subscribe(Notifications.TOPIC)
    }

    fun <T> completableFutureOf(obj: T): CompletableFuture<T> {
        val future = CompletableFuture<T>()
        future.complete(obj)
        return future
    }
}
