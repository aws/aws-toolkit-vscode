// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.progress.ProgressIndicator
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.services.schemas.code.SchemaCodeDownloadRequestDetails
import software.aws.toolkits.jetbrains.services.schemas.code.SchemaCodeDownloader
import java.nio.file.Path

class SamSchemaDownloadPostCreationAction {
    fun downloadCodeIntoWorkspace(
        schemaTemplateParameters: SchemaTemplateParameters,
        schemaSourceRoot: Path,
        language: SchemaCodeLangs,
        connectionSettings: ConnectionSettings,
        indicator: ProgressIndicator
    ) {
        val codeGenDownloader = SchemaCodeDownloader.create(connectionSettings)

        codeGenDownloader.downloadCode(
            SchemaCodeDownloadRequestDetails(
                schemaTemplateParameters.schema,
                schemaTemplateParameters.schemaVersion,
                language,
                schemaSourceRoot.toFile()
            ),
            indicator
        ).toCompletableFuture().get()
    }
}
