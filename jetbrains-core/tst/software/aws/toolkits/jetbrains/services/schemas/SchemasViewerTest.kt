// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import java.io.File
import java.util.concurrent.CompletableFuture.completedFuture

class SchemasViewerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    private var errorNotification: Notification? = null

    private val fileEditorManager = FileEditorManager.getInstance(projectRule.project)

    private val CREDENTIAL_IDENTIFIER = MockCredentialsManager.DUMMY_PROVIDER_IDENTIFIER.displayName
    private val REGION = MockProjectAccountSettingsManager.getInstance(projectRule.project).activeRegion.id
    private val REGISTRY = "registry"
    private val SCHEMA = "schema"
    private val SCHEMA_SUPER_LONG_NAME =
        "schema12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890" +
            "12345678901234567890123456789012345678901234567890123456789012345678901234567890"
    private val SCHEMA_SPECIAL_CHARACTER = "schema:awesome"
    private val SCHEMA_SPECIAL_CHARACTER_SANITIZED = "schema_awesome"
    private val VERSION = "2"

    private val AWS_EVENT_SCHEMA_RAW = File(javaClass.getResource("/awsEventSchemaRaw.json.txt").toURI()).readText(Charsets.UTF_8)
    private val AWS_EVENT_SCHEMA_PRETTY = File(javaClass.getResource("/awsEventSchemaPretty.json.txt").toURI()).readText(Charsets.UTF_8)

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

        resourceCache().mockSchemaCache(REGISTRY, SCHEMA, schemaResponse)

        val actualResponse = SchemaDownloader().getSchemaContent(REGISTRY, SCHEMA, project = projectRule.project).toCompletableFuture().get()

        assertThat(actualResponse).isEqualTo(schemaResponse)
    }

    @Test
    fun canPrettyPrintSchemaContent() {
        val prettySchema = SchemaFormatter().prettySchemaContent(AWS_EVENT_SCHEMA_RAW).toCompletableFuture().get()

        assertThat(prettySchema.trim()).isEqualToNormalizingNewlines(AWS_EVENT_SCHEMA_PRETTY.trim())
    }

    @Test
    fun canOpenFileDialog() {
        runInEdtAndGet {
            SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project).toCompletableFuture()
        }.get()

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(getSchemaFileName(SCHEMA)) }
    }

    @Test
    fun canOpenFileDialogLongSchemaName() {
        runInEdtAndGet {
            SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA_SUPER_LONG_NAME, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project).toCompletableFuture()
        }.get()

        val trimmedSchemaFileName = getSchemaFileName(SCHEMA_SUPER_LONG_NAME).substring(0, SchemaPreviewer.MAX_FILE_LENGTH) +
            SchemaPreviewer.SCHEMA_EXTENSION
        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(trimmedSchemaFileName) }
    }

    @Test
    fun canOpenFileDialogSchemaNameWithSpecialCharacters() {
        runInEdtAndGet {
            SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA_SPECIAL_CHARACTER, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project).toCompletableFuture()
        }.get()

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying {
            assertThat(it.name).isEqualTo(getSchemaFileName(SCHEMA_SPECIAL_CHARACTER_SANITIZED))
        }
    }

    @Test
    fun canDownloadAndViewSchema() {
        val schema = DescribeSchemaResponse.builder()
            .content(AWS_EVENT_SCHEMA_RAW)
            .schemaName(SCHEMA)
            .schemaVersion(VERSION)
            .build()

        resourceCache().mockSchemaCache(REGISTRY, SCHEMA, schema)

        val mockSchemaDownloader = mock<SchemaDownloader> {
            on { getSchemaContent(REGISTRY, SCHEMA, project = projectRule.project) }.thenReturn(completedFuture(schema))
        }
        val mockSchemaFormatter = mock<SchemaFormatter> {
            on { prettySchemaContent(AWS_EVENT_SCHEMA_RAW) }.thenReturn(completedFuture(AWS_EVENT_SCHEMA_PRETTY))
        }
        val mockSchemaPreviewer = mock<SchemaPreviewer> {
            on { openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project) }.thenReturn(completedFuture(null))
        }

        runInEdtAndGet {
            SchemaViewer(projectRule.project, mockSchemaDownloader, mockSchemaFormatter, mockSchemaPreviewer).downloadAndViewSchema(SCHEMA, REGISTRY)
                .toCompletableFuture()
        }.get()

        // Assert no error notifications
        assertThat(errorNotification?.dropDownText).isNull()

        verify(mockSchemaDownloader).getSchemaContent(REGISTRY, SCHEMA, project = projectRule.project)
        verify(mockSchemaFormatter).prettySchemaContent(AWS_EVENT_SCHEMA_RAW)
        verify(mockSchemaPreviewer).openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project)
    }

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.mockSchemaCache(registryName: String, schemaName: String, schema: DescribeSchemaResponse) {
        this.addEntry(SchemasResources.getSchema(registryName, schemaName), completedFuture(schema))
    }

    private fun subscribeToNotifications() {
        val project = projectRule.project

        val messageBus = project.messageBus.connect()

        messageBus.setDefaultHandler { _, params ->
            errorNotification = params[0] as Notification
        }
        messageBus.subscribe(Notifications.TOPIC)
    }

    private fun getSchemaFileName(schemaName: String) = "${CREDENTIAL_IDENTIFIER}_${REGION}_${REGISTRY}_${schemaName}_$VERSION.json"
}
