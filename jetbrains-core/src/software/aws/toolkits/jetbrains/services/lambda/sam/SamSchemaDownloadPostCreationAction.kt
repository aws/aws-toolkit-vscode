// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.lambda.sam

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaTemplateParameters
import software.aws.toolkits.jetbrains.services.schemas.code.SchemaCodeDownloadRequestDetails
import software.aws.toolkits.jetbrains.services.schemas.code.SchemaCodeDownloader
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.Path

private val NOTIFICATION_TITLE = message("schemas.service_name")

class SamSchemaDownloadPostCreationAction {
    fun downloadCodeIntoWorkspace(
        schemaTemplateParameters: SchemaTemplateParameters,
        contentRoot: VirtualFile,
        schemaSourceRoot: Path,
        language: SchemaCodeLangs,
        sourceCreatingProject: Project,
        newApplicationProject: Project,
        indicator: ProgressIndicator
    ) {
        // Use sourceCreatingProject instead of rootModel.project because the new project may not have AWS credentials configured yet
        val codeGenDownloader = SchemaCodeDownloader.create(AwsClientManager.getInstance(sourceCreatingProject))

        codeGenDownloader.downloadCode(
            SchemaCodeDownloadRequestDetails(
                schemaTemplateParameters.schema, schemaTemplateParameters.schemaVersion, language, schemaSourceRoot.toString()
            ),
            indicator
        ).toCompletableFuture().get()

        VfsUtil.markDirtyAndRefresh(false, true, true, contentRoot)

        initializeNewProjectCredentialsFromSourceCreatingProject(newApplicationProject, sourceCreatingProject)

        validateDownloadedCodeAgainstSchema(schemaTemplateParameters, contentRoot, language, newApplicationProject)
    }

    private fun initializeNewProjectCredentialsFromSourceCreatingProject(newApplicationProject: Project, sourceCreatingProject: Project) {
        val newApplicationProjectSettings = ProjectAccountSettingsManager.getInstance(newApplicationProject)
        if (newApplicationProjectSettings.isValidConnectionSettings()) {
            return
        }

        val sourceCreatingProjectSettings = ProjectAccountSettingsManager.getInstance(sourceCreatingProject)
        if (!sourceCreatingProjectSettings.isValidConnectionSettings()) {
            return
        }

        newApplicationProjectSettings.changeCredentialProvider(sourceCreatingProjectSettings.selectedCredentialIdentifier)
        newApplicationProjectSettings.changeRegion(sourceCreatingProjectSettings.activeRegion)
    }

    // SchemaTemplateParameters  were provided to the SAM template intended to match the downloaded code
    // But because as of the Schemas 2019 launch these were not provided by the server, there is a risk that the client has a bug,
    // or the server changes and diverges. So just to be sure, let's validate the primary downloaded code file, and if something went wrong warn the user
    private fun validateDownloadedCodeAgainstSchema(
        schemaTemplateParameters: SchemaTemplateParameters,
        contentRoot: VirtualFile,
        language: SchemaCodeLangs,
        newApplicationProject: Project
    ) {

        val schemaRootEventName = schemaTemplateParameters.templateExtraContext.schemaRootEventName
        val schemaRootEventFileName = "$schemaRootEventName.${language.extension}"
        val schemaPackageHierarchy = schemaTemplateParameters.templateExtraContext.schemaPackageHierarchy

        val contentRootFile = VfsUtil.virtualToIoFile(contentRoot)
        val schemaRootEventFile = FileUtil.fileTraverser(contentRootFile).bfsTraversal().firstOrNull { it.name == schemaRootEventFileName }

        if (schemaRootEventFile == null) {
            // File not found
            notifyOnValidationFailure(
                schemaRootEventName,
                schemaPackageHierarchy,
                message("sam.init.schema.validation_failed.file_not_found"),
                newApplicationProject
            )
            return
        }

        val filePathMatchesPackage = schemaRootEventFile.parentFile.toPath().endsWith(schemaPackageHierarchy.replace(".", File.separator))
        if (!filePathMatchesPackage) {
            notifyOnValidationFailure(
                schemaRootEventName,
                schemaPackageHierarchy,
                message("sam.init.schema.validation_failed.package_not_found", schemaRootEventFile.parent),
                newApplicationProject
            )
            return
        }
    }

    private fun notifyOnValidationFailure(
        schemaRootEventName: String,
        schemaPackageHierarchy: String,
        specificValidationError: String,
        newApplicationProject: Project
    ) {
        notifyError(
            title = NOTIFICATION_TITLE,
            content = message("sam.init.schema.validation_failed", schemaRootEventName, schemaPackageHierarchy, specificValidationError),
            project = newApplicationProject
        )
    }
}
