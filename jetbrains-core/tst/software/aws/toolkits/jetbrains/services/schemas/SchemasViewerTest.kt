// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.utils.rules.NotificationListenerRule
import java.util.concurrent.CompletableFuture.completedFuture

class SchemasViewerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Rule
    @JvmField
    val mockCredentialManager = MockCredentialManagerRule()

    @Rule
    @JvmField
    val mockRegionProvider = MockRegionProviderRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val notificationListener = NotificationListenerRule(projectRule, disposableRule.disposable)

    private lateinit var fileEditorManager: FileEditorManager

    @Before
    fun setup() {
        fileEditorManager = FileEditorManager.getInstance(projectRule.project)
    }

    @After
    fun cleanUp() {
        runInEdtAndWait {
            fileEditorManager.openFiles.forEach { fileEditorManager.closeFile(it) }
        }
    }

    @Test
    fun canGetSchemaContent() {
        val schemaResponse = DescribeSchemaResponse.builder()
            .content(AWS_EVENT_SCHEMA_RAW)
            .build()

        val connectionSettings = ConnectionSettings(mockCredentialManager.createCredentialProvider(), mockRegionProvider.createAwsRegion())
        mockSchemaCache(connectionSettings, schemaResponse)

        val actualResponse = SchemaDownloader().getSchemaContent(
            REGISTRY,
            SCHEMA,
            connectionSettings = connectionSettings
        ).toCompletableFuture().get()

        assertThat(actualResponse).isEqualTo(schemaResponse)
    }

    @Test
    fun canPrettyPrintSchemaContent() {
        val prettySchema = SchemaFormatter().prettySchemaContent(AWS_EVENT_SCHEMA_RAW).toCompletableFuture().get()

        assertThat(prettySchema.trim()).isEqualToNormalizingNewlines(AWS_EVENT_SCHEMA_PRETTY.trim())
    }

    @Test
    fun canOpenFileDialog() {
        val connectionSettings = ConnectionSettings(mockCredentialManager.createCredentialProvider(), mockRegionProvider.createAwsRegion())

        SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project, connectionSettings)
            .toCompletableFuture()
            .get()

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(getSchemaFileName(connectionSettings, SCHEMA)) }
    }

    @Test
    fun canOpenFileDialogLongSchemaName() {
        val connectionSettings = ConnectionSettings(mockCredentialManager.createCredentialProvider(), mockRegionProvider.createAwsRegion())

        runInEdtAndGet {
            SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA_SUPER_LONG_NAME, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project, connectionSettings)
                .toCompletableFuture()
        }.get()

        val trimmedSchemaFileName = getSchemaFileName(connectionSettings, SCHEMA_SUPER_LONG_NAME).substring(0, SchemaPreviewer.MAX_FILE_LENGTH) +
            SchemaPreviewer.SCHEMA_EXTENSION
        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying { assertThat(it.name).isEqualTo(trimmedSchemaFileName) }
    }

    @Test
    fun canOpenFileDialogSchemaNameWithSpecialCharacters() {
        val connectionSettings = ConnectionSettings(mockCredentialManager.createCredentialProvider(), mockRegionProvider.createAwsRegion())

        runInEdtAndGet {
            SchemaPreviewer().openFileInEditor(REGISTRY, SCHEMA_SPECIAL_CHARACTER, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project, connectionSettings)
                .toCompletableFuture()
        }.get()

        assertThat(fileEditorManager.openFiles).hasOnlyOneElementSatisfying {
            assertThat(it.name).isEqualTo(getSchemaFileName(connectionSettings, SCHEMA_SPECIAL_CHARACTER_SANITIZED))
        }
    }

    @Test
    fun canDownloadAndViewSchema() {
        val schemaResponse = DescribeSchemaResponse.builder()
            .content(AWS_EVENT_SCHEMA_RAW)
            .schemaName(SCHEMA)
            .schemaVersion(VERSION)
            .build()

        val connectionSettings = ConnectionSettings(
            mockCredentialManager.createCredentialProvider(),
            mockRegionProvider.createAwsRegion()
        )
        mockSchemaCache(connectionSettings, schemaResponse)

        val mockSchemaDownloader = mock<SchemaDownloader> {
            on {
                getSchemaContent(
                    REGISTRY,
                    SCHEMA,
                    connectionSettings = connectionSettings
                )
            }.thenReturn(completedFuture(schemaResponse))
        }
        val mockSchemaFormatter = mock<SchemaFormatter> {
            on { prettySchemaContent(AWS_EVENT_SCHEMA_RAW) }.thenReturn(completedFuture(AWS_EVENT_SCHEMA_PRETTY))
        }
        val mockSchemaPreviewer = mock<SchemaPreviewer> {
            on {
                openFileInEditor(
                    REGISTRY,
                    SCHEMA,
                    AWS_EVENT_SCHEMA_PRETTY,
                    VERSION,
                    projectRule.project,
                    connectionSettings
                )
            }.thenReturn(completedFuture(null))
        }

        runInEdtAndGet {
            SchemaViewer(projectRule.project, mockSchemaDownloader, mockSchemaFormatter, mockSchemaPreviewer).downloadAndViewSchema(
                SCHEMA,
                REGISTRY,
                connectionSettings
            ).toCompletableFuture()
        }.get()

        // Assert no error notifications
        assertThat(notificationListener.notifications).isEmpty()

        verify(mockSchemaDownloader).getSchemaContent(
            REGISTRY,
            SCHEMA,
            connectionSettings = connectionSettings
        )
        verify(mockSchemaFormatter).prettySchemaContent(AWS_EVENT_SCHEMA_RAW)
        verify(mockSchemaPreviewer).openFileInEditor(REGISTRY, SCHEMA, AWS_EVENT_SCHEMA_PRETTY, VERSION, projectRule.project, connectionSettings)
    }

    private fun mockSchemaCache(connectionSettings: ConnectionSettings, schema: DescribeSchemaResponse) {
        resourceCache.addEntry(connectionSettings, SchemasResources.getSchema(REGISTRY, SCHEMA), completedFuture(schema))
    }

    private fun getSchemaFileName(connectionSettings: ConnectionSettings, schemaName: String) =
        "${connectionSettings.credentials.id}_${connectionSettings.region.id}_${REGISTRY}_${schemaName}_$VERSION.json"

    private companion object {
        private const val REGISTRY = "registry"
        private const val SCHEMA = "schema"
        private const val SCHEMA_SUPER_LONG_NAME =
            "schema12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789" +
                "012345678901234567890123456789012345678901234567890" +
                "1234567890123456789012345678901234567890123456789012" +
                "3456789012345678901234567890"
        private const val SCHEMA_SPECIAL_CHARACTER = "schema:awesome"
        private const val SCHEMA_SPECIAL_CHARACTER_SANITIZED = "schema_awesome"
        private const val VERSION = "2"

        private val AWS_EVENT_SCHEMA_RAW = SchemasViewerTest::class.java.getResourceAsStream("/awsEventSchemaRaw.json.txt")!!.bufferedReader().readText()
        private val AWS_EVENT_SCHEMA_PRETTY = SchemasViewerTest::class.java.getResourceAsStream("/awsEventSchemaPretty.json.txt")!!.bufferedReader().readText()
    }
}
